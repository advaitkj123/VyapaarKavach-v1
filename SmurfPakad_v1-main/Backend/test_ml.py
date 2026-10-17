"""Quick test script for ML service with mock data"""
import sys
sys.path.insert(0, '.')
import pandas as pd
from app.services.ml_service import ml_service

# Load the mock UPI transactions data
df = pd.read_csv('../Backend/demo_data/upi_transactions_demo.csv')
print('Dataset shape:', df.shape)
print('Columns:', list(df.columns))
print()

# Run analysis
results = ml_service.analyze_transactions(df)
print('--- Analysis Results ---')
print('Summary:', results['summary'])
print('Patterns found:', len(results['patterns']))
print('Suspicious addresses:', len(results['suspicious_addresses']))
if results['suspicious_addresses']:
    top = sorted(results['suspicious_addresses'], key=lambda x: x.get('suspiciousScore', 0), reverse=True)[:5]
    for a in top:
        addr_id = a.get('id', 'unknown')
        score = a.get('suspiciousScore', 0)
        print(f'  {addr_id} -> score={score:.3f}')
