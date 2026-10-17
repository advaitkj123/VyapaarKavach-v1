import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import global_mean_pool, global_max_pool
from torch_geometric.loader import DataLoader
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (precision_score, recall_score, f1_score,
                             confusion_matrix, average_precision_score)
import numpy as np
import warnings
warnings.filterwarnings('ignore', message='.*scatter.*')

# Use OUR modified GATv2Conv with temperature gating
from AI.gatv2_conv import GATv2Conv

torch.manual_seed(42)
np.random.seed(42)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print('Device:', device)

# ============ DATA ============
final_data = torch.load('dataset_smurf.pt', weights_only=False)
split = int(0.8 * len(final_data))
split1 = int(0.72 * len(final_data))
train_dataset = final_data[:split1]
val_data = final_data[split1:split]
test_dataset = final_data[split:]

print(f'Train: {len(train_dataset)} | Val: {len(val_data)} | Test: {len(test_dataset)}')
print(f'Train pos: {sum(1 for d in train_dataset if d.y.item()==1)}')
print(f'Val pos: {sum(1 for d in val_data if d.y.item()==1)}')
print(f'Test pos: {sum(1 for d in test_dataset if d.y.item()==1)}')

# Normalize
all_standard_x = torch.cat([d.x for d in train_dataset], dim=0)
scaler = StandardScaler()
scaler.fit(all_standard_x.numpy())

for d in train_dataset:
    d.x = torch.tensor(scaler.transform(d.x.numpy()), dtype=torch.float32)
for d in test_dataset:
    d.x = torch.tensor(scaler.transform(d.x.numpy()), dtype=torch.float32)
for d in val_data:
    d.x = torch.tensor(scaler.transform(d.x.numpy()), dtype=torch.float32)

# Class weights (from paper)
weight_licit = 0.51
weight_sus = 7.56
class_weight = torch.tensor([weight_licit, weight_sus], dtype=torch.float32).to(device)

train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True, num_workers=0, pin_memory=False)
val_loader = DataLoader(val_data, batch_size=64, shuffle=False, num_workers=0, pin_memory=False)
test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False, num_workers=0, pin_memory=False)

# ============ MODEL ============
class SmurfDetector(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = GATv2Conv(43, 16, heads=4)
        self.bn1 = nn.BatchNorm1d(64)
        self.conv2 = GATv2Conv(64, 16, heads=4)
        self.bn2 = nn.BatchNorm1d(64)
        self.conv3 = GATv2Conv(64, 16, heads=4)
        self.bn3 = nn.BatchNorm1d(64)
        self.classifier = nn.Linear(128, 2)

    def forward(self, x, edge_index, batch):
        x = self.conv1(x, edge_index)
        x = self.bn1(x)
        x = F.relu(x)
        x = F.dropout(x, p=0.4, training=self.training)
        
        x = self.conv2(x, edge_index)
        x = self.bn2(x)
        x = F.relu(x)
        x = F.dropout(x, p=0.4, training=self.training)
        
        x = self.conv3(x, edge_index)
        x = self.bn3(x)
        x = F.relu(x)
        x = F.dropout(x, p=0.4, training=self.training)
        
        x = torch.cat([global_mean_pool(x, batch), global_max_pool(x, batch)], dim=1)
        x = self.classifier(x)
        return x

model = SmurfDetector().to(device)
print('Model:', model)
print(f'Total params: {sum(p.numel() for p in model.parameters())}')

optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
criterion = nn.CrossEntropyLoss(weight=class_weight)
scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', patience=10, factor=0.5)

# ============ VALIDATION WITH THRESHOLD SWEEP ============
def validate(model, loader, criterion):
    model.eval()
    all_probs = []
    all_labels = []
    val_loss = 0.0
    with torch.no_grad():
        for batch in loader:
            batch = batch.to(device)
            out = model(batch.x, batch.edge_index, batch.batch)
            loss = criterion(out, batch.y)
            val_loss += loss.item()
            probs = torch.softmax(out, dim=1)[:, 1].cpu().numpy()
            all_probs.extend(probs)
            all_labels.extend(batch.y.cpu().numpy())
    
    all_labels = np.array(all_labels)
    all_probs = np.array(all_probs)
    avg_loss = val_loss / len(loader)
    
    # Threshold sweep
    thresholds = np.arange(0.05, 0.96, 0.01)
    best_f1 = 0
    best_t = 0.5
    for t in thresholds:
        preds_t = (all_probs >= t).astype(int)
        f1 = f1_score(all_labels, preds_t, pos_label=1, zero_division=0)
        if f1 > best_f1:
            best_f1 = f1
            best_t = t
    
    return avg_loss, best_f1, best_t, all_probs, all_labels

# ============ TRAINING ============
print('\n=== TRAINING (Temperature-Gated GATv2) ===')
best_f1 = 0.0
best_t = 0.5
patience = 0

for epoch in range(100):
    model.train()
    total_loss = 0.0
    for batch in train_loader:
        batch = batch.to(device)
        optimizer.zero_grad()
        out = model(batch.x, batch.edge_index, batch.batch)
        loss = criterion(out, batch.y)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    
    val_loss, val_f1, val_t, _, _ = validate(model, val_loader, criterion)
    scheduler.step(val_f1)
    lr = optimizer.param_groups[0]['lr']
    
    t1 = model.conv1.temperature.data.squeeze().tolist()
    t2 = model.conv2.temperature.data.squeeze().tolist()
    t3 = model.conv3.temperature.data.squeeze().tolist()
    
    if val_f1 > best_f1:
        best_f1 = val_f1
        best_t = val_t
        patience = 0
        torch.save(model.state_dict(), 'best_model_tg.pt')
        print(f'Epoch {epoch+1:3d}: Train Loss={total_loss/len(train_loader):.4f} | Val Loss={val_loss:.4f} | Val F1={val_f1:.4f} @ t={val_t:.2f} | LR={lr:.6f}')
        print(f'         Temps: C1={t1}')
        print(f'                  C2={t2}')
        print(f'                  C3={t3}')
    else:
        patience += 1
        if epoch % 10 == 0:
            print(f'Epoch {epoch+1:3d}: Train Loss={total_loss/len(train_loader):.4f} | Val Loss={val_loss:.4f} | Val F1={val_f1:.4f} @ t={val_t:.2f} | LR={lr:.6f}')
    
    if patience >= 20:
        print(f'\nEarly stopping at epoch {epoch+1}; best Val F1 = {best_f1:.4f} @ t={best_t:.2f}')
        break

# ============ TEST EVALUATION ============
print('\n=== TEST EVALUATION ===')
model.load_state_dict(torch.load('best_model_tg.pt', map_location=device))
model.eval()

test_probs = []
test_labels = []
for batch in test_loader:
    batch = batch.to(device)
    with torch.no_grad():
        out = model(batch.x, batch.edge_index, batch.batch)
    probs = torch.softmax(out, dim=1)[:, 1].cpu().numpy()
    test_probs.extend(probs)
    test_labels.extend(batch.y.cpu().numpy())

test_probs = np.array(test_probs)
test_labels = np.array(test_labels)

# At 0.5 threshold
preds_05 = (test_probs >= 0.50).astype(int)
# At val-optimal threshold
preds_t = (test_probs >= best_t).astype(int)

pr_auc = average_precision_score(test_labels, test_probs)

print('=' * 60)
print('TEST SET RESULTS (Temperature-Gated GATv2)')
print('=' * 60)
print(f'Total subgraphs  : {len(test_labels)}')
print(f'Actual suspicious: {test_labels.sum()}')
print()
print(f'[At threshold 0.50]')
print(f'  Precision : {precision_score(test_labels, preds_05, pos_label=1, zero_division=0):.4f}')
print(f'  Recall    : {recall_score(test_labels, preds_05, pos_label=1, zero_division=0):.4f}')
print(f'  F1        : {f1_score(test_labels, preds_05, pos_label=1, zero_division=0):.4f}')
print(f'  CM:\n{confusion_matrix(test_labels, preds_05)}')
print()
print(f'[At threshold {best_t:.2f} (val-optimal)]')
print(f'  Precision : {precision_score(test_labels, preds_t, pos_label=1, zero_division=0):.4f}')
print(f'  Recall    : {recall_score(test_labels, preds_t, pos_label=1, zero_division=0):.4f}')
print(f'  F1        : {f1_score(test_labels, preds_t, pos_label=1, zero_division=0):.4f}')
print(f'  CM:\n{confusion_matrix(test_labels, preds_t)}')
print()
print(f'PR-AUC: {pr_auc:.4f}')
print('=' * 60)

print('\nFinal Temperatures:')
print(f'Conv1: {model.conv1.temperature.data.squeeze().tolist()}')
print(f'Conv2: {model.conv2.temperature.data.squeeze().tolist()}')
print(f'Conv3: {model.conv3.temperature.data.squeeze().tolist()}')