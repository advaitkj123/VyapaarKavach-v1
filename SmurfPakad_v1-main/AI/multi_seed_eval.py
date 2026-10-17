import torch
import numpy as np
from torch_geometric.loader import DataLoader
from AI.gatv2_conv import GATv2Conv
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import global_mean_pool, global_max_pool
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import f1_score, average_precision_score
import warnings
warnings.filterwarnings('ignore', message='.*scatter.*')

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Load FULL dataset
final_data = torch.load('dataset_smurf.pt', weights_only=False)

# USE SUBSET FOR FAST MULTI-SEED TESTING (5000 graphs ≈ 3-4 min per seed)
SUBSET_SIZE = 5000
final_data = final_data[:SUBSET_SIZE]
print(f'Using subset of {SUBSET_SIZE} graphs for fast multi-seed eval')

def run_seed(seed):
    torch.manual_seed(seed)
    np.random.seed(seed)
    
    # Split
    split = int(0.8 * len(final_data))
    split1 = int(0.72 * len(final_data))
    train_dataset = final_data[:split1]
    val_data = final_data[split1:split]
    test_dataset = final_data[split:]
    
    # Normalize
    all_standard_x = torch.cat([d.x for d in train_dataset], dim=0)
    scaler = StandardScaler()
    scaler.fit(all_standard_x.numpy())
    for d in train_dataset: d.x = torch.tensor(scaler.transform(d.x.numpy()), dtype=torch.float32)
    for d in test_dataset: d.x = torch.tensor(scaler.transform(d.x.numpy()), dtype=torch.float32)
    for d in val_data: d.x = torch.tensor(scaler.transform(d.x.numpy()), dtype=torch.float32)
    
    weight_licit = 0.51; weight_sus = 7.56
    class_weight = torch.tensor([weight_licit, weight_sus], dtype=torch.float32).to(device)
    
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True, num_workers=0, pin_memory=False)
    val_loader = DataLoader(val_data, batch_size=64, shuffle=False, num_workers=0, pin_memory=False)
    test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False, num_workers=0, pin_memory=False)
    
    class SmurfDetector(nn.Module):
        def __init__(self):
            super().__init__()
            self.conv1 = GATv2Conv(43,16,heads=4)
            self.bn1 = nn.BatchNorm1d(64)
            self.conv2 = GATv2Conv(64,16,heads=4)
            self.bn2 = nn.BatchNorm1d(64)
            self.conv3 = GATv2Conv(64,16,heads=4)
            self.bn3 = nn.BatchNorm1d(64)
            self.classifier = nn.Linear(128,2)
        def forward(self, x, edge_index, batch):
            x = self.conv1(x, edge_index); x = self.bn1(x); x = F.relu(x); x = F.dropout(x, p=0.4, training=self.training)
            x = self.conv2(x, edge_index); x = self.bn2(x); x = F.relu(x); x = F.dropout(x, p=0.4, training=self.training)
            x = self.conv3(x, edge_index); x = self.bn3(x); x = F.relu(x); x = F.dropout(x, p=0.4, training=self.training)
            x = torch.cat([global_mean_pool(x, batch), global_max_pool(x, batch)], dim=1)
            x = self.classifier(x)
            return x
    
    model = SmurfDetector().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    criterion = nn.CrossEntropyLoss(weight=class_weight)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='max', patience=5, factor=0.5)
    
    def validate(model, loader):
        model.eval()
        all_probs = []; all_labels = []
        with torch.no_grad():
            for batch in loader:
                batch = batch.to(device)
                out = model(batch.x, batch.edge_index, batch.batch)
                probs = torch.softmax(out, dim=1)[:, 1].cpu().numpy()
                all_probs.extend(probs); all_labels.extend(batch.y.cpu().numpy())
        all_labels = np.array(all_labels); all_probs = np.array(all_probs)
        thresholds = np.arange(0.05, 0.96, 0.01)
        best_f1 = 0; best_t = 0.5
        for t in thresholds:
            preds_t = (all_probs >= t).astype(int)
            f1 = f1_score(all_labels, preds_t, pos_label=1, zero_division=0)
            if f1 > best_f1: best_f1 = f1; best_t = t
        return best_f1, best_t, all_probs, all_labels
    
    # Train (15 epochs for speed on subset)
    best_f1 = 0; best_t = 0.5; patience = 0
    for epoch in range(15):
        model.train()
        for batch in train_loader:
            batch = batch.to(device)
            optimizer.zero_grad()
            out = model(batch.x, batch.edge_index, batch.batch)
            loss = criterion(out, batch.y)
            loss.backward()
            optimizer.step()
        
        val_f1, val_t, _, _ = validate(model, val_loader)
        scheduler.step(val_f1)
        if val_f1 > best_f1:
            best_f1 = val_f1; best_t = val_t; patience = 0
            torch.save(model.state_dict(), f'best_seed{seed}.pt')
        else:
            patience += 1
        if patience >= 5: break
    
    # Test
    model.load_state_dict(torch.load(f'best_seed{seed}.pt', map_location=device))
    model.eval()
    test_probs = []; test_labels = []
    for batch in test_loader:
        batch = batch.to(device)
        with torch.no_grad():
            out = model(batch.x, batch.edge_index, batch.batch)
        probs = torch.softmax(out, dim=1)[:, 1].cpu().numpy()
        test_probs.extend(probs); test_labels.extend(batch.y.cpu().numpy())
    
    test_probs = np.array(test_probs); test_labels = np.array(test_labels)
    preds = (test_probs >= best_t).astype(int)
    test_f1 = f1_score(test_labels, preds, pos_label=1, zero_division=0)
    test_pr = average_precision_score(test_labels, test_probs)
    
    return test_f1, test_pr, best_t

# Run 5 seeds
seeds = [42, 123, 456, 789, 999]
results = []
for s in seeds:
    print(f'Running seed {s}...')
    f1, pr, t = run_seed(s)
    results.append((s, f1, pr, t))
    print(f'  Seed {s}: F1={f1:.4f} @ t={t:.2f}, PR-AUC={pr:.4f}')

print()
print('=== SUMMARY ===')
f1s = [r[1] for r in results]
prs = [r[2] for r in results]
print(f'F1: mean={np.mean(f1s):.4f} ± {np.std(f1s):.4f}')
print(f'PR-AUC: mean={np.mean(prs):.4f} ± {np.std(prs):.4f}')
print(f'Range: [{min(f1s):.4f}, {max(f1s):.4f}]')