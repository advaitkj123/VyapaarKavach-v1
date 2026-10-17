# pyright: basic
# type: ignore
"""
Temporal Feature Engineering for AML Detection
================================================
Computes time-based features that are critical for detecting smurfing patterns.

Why Temporal Features Matter:
  - Smurfing follows a TIME pattern: split → wait → aggregate
  - Burst detection: sudden spike in outgoing TXs = structuring
  - Velocity: too many TXs in short window = automated bot
  - Dormancy: long idle → sudden activity = compromised account
  - Round amounts: just below CTR thresholds ($9,900, ₹9,999) = evasion

Feature Groups:
  1. Transaction velocity (per-wallet TX rate over time windows)
  2. Burst detection (sudden spikes in activity)
  3. Temporal regularity (regular intervals = bot behavior)
  4. Amount patterns (round amounts, threshold evasion)
  5. Time-of-day patterns (unusual hours = suspicious)
  6. Dormancy metrics (idle periods before sudden activity)

Usage:
  from temporal_features import TemporalFeatureEngineer
  engineer = TemporalFeatureEngineer()
  enhanced_df = engineer.compute_all_features(transactions_df)
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict


class TemporalFeatureEngineer:
    """
    Computes temporal features for transaction data.
    
    Works with both:
    - Wallet-based datasets (Source_Wallet_ID, Dest_Wallet_ID, Amount, Timestamp)
    - Elliptic-style datasets (timestep column as proxy for time)
    """
    
    # CTR (Currency Transaction Report) thresholds by jurisdiction
    CTR_THRESHOLDS = {
        'USD': 10_000,
        'INR': 10_00_000,  # ₹10 Lakh
        'EUR': 15_000,
        'GBP': 10_000,
        'DEFAULT': 10_000,
    }
    
    # Smurfing typically keeps amounts just below these
    STRUCTURING_MARGINS = [0.90, 0.95, 0.99]  # 90%, 95%, 99% of threshold
    
    def __init__(self, currency: str = 'DEFAULT'):
        self.ctr_threshold = self.CTR_THRESHOLDS.get(currency, self.CTR_THRESHOLDS['DEFAULT'])
    
    # =========================================================================
    # Main API
    # =========================================================================
    
    def compute_all_features(
        self,
        df: pd.DataFrame,
        source_col: Optional[str] = None,
        target_col: Optional[str] = None,
        amount_col: Optional[str] = None,
        time_col: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Compute all temporal features and return enriched DataFrame.
        
        Auto-detects column names if not provided.
        
        Returns:
            DataFrame with original columns + new temporal features
        """
        # Auto-detect columns
        source_col = source_col or self._detect_column(df, ['Source_Wallet_ID', 'source_wallet_id', 'from_address', 'source', 'txId1'])
        target_col = target_col or self._detect_column(df, ['Dest_Wallet_ID', 'dest_wallet_id', 'to_address', 'target', 'txId2'])
        amount_col = amount_col or self._detect_column(df, ['Amount', 'amount', 'value', 'Value'])
        time_col = time_col or self._detect_column(df, ['Timestamp', 'timestamp', 'created_at', 'date', 'time', 'block_timestamp'])
        
        result = df.copy()
        
        # Parse timestamps if available
        if time_col and time_col in df.columns:
            result = self._parse_timestamps(result, time_col)
            has_time = True
        else:
            has_time = False
        
        # Amount-based features (always available if amount column exists)
        if amount_col and amount_col in df.columns:
            result = self._compute_amount_features(result, amount_col)
            
            if source_col and source_col in df.columns:
                result = self._compute_wallet_amount_stats(result, source_col, target_col, amount_col)
        
        # Time-based features (only if timestamps available)
        if has_time and source_col and source_col in df.columns:
            result = self._compute_velocity_features(result, source_col, target_col, time_col)
            result = self._compute_burst_features(result, source_col, time_col)
            result = self._compute_regularity_features(result, source_col, time_col)
            result = self._compute_time_of_day_features(result, time_col)
            result = self._compute_dormancy_features(result, source_col, time_col)
        
        return result
    
    def compute_wallet_features(
        self,
        df: pd.DataFrame,
        source_col: str = 'Source_Wallet_ID',
        target_col: str = 'Dest_Wallet_ID',
        amount_col: str = 'Amount',
        time_col: str = 'Timestamp',
    ) -> pd.DataFrame:
        """
        Compute per-WALLET aggregate temporal features.
        Returns a DataFrame with one row per unique wallet.
        
        This is used to enrich wallet-based graph node features.
        """
        all_wallets = set()
        if source_col in df.columns:
            all_wallets.update(df[source_col].dropna().astype(str).unique())
        if target_col in df.columns:
            all_wallets.update(df[target_col].dropna().astype(str).unique())
        
        wallet_features = []
        
        for wallet_id in sorted(all_wallets):
            feats = {'wallet_id': wallet_id}
            
            # Transactions sent by this wallet
            sent_mask = df[source_col].astype(str) == wallet_id if source_col in df.columns else pd.Series(False, index=df.index)
            recv_mask = df[target_col].astype(str) == wallet_id if target_col in df.columns else pd.Series(False, index=df.index)
            
            sent_df = df[sent_mask]
            recv_df = df[recv_mask]
            
            # Degree features
            feats['out_degree'] = len(sent_df)
            feats['in_degree'] = len(recv_df)
            feats['total_degree'] = feats['out_degree'] + feats['in_degree']
            
            # Amount features
            if amount_col in df.columns:
                sent_amounts = sent_df[amount_col].astype(float) if len(sent_df) > 0 else pd.Series(dtype=float)
                recv_amounts = recv_df[amount_col].astype(float) if len(recv_df) > 0 else pd.Series(dtype=float)
                
                feats['total_sent'] = sent_amounts.sum() if len(sent_amounts) > 0 else 0
                feats['total_received'] = recv_amounts.sum() if len(recv_amounts) > 0 else 0
                feats['avg_sent'] = sent_amounts.mean() if len(sent_amounts) > 0 else 0
                feats['avg_received'] = recv_amounts.mean() if len(recv_amounts) > 0 else 0
                feats['max_sent'] = sent_amounts.max() if len(sent_amounts) > 0 else 0
                feats['max_received'] = recv_amounts.max() if len(recv_amounts) > 0 else 0
                feats['std_sent'] = sent_amounts.std() if len(sent_amounts) > 1 else 0
                feats['std_received'] = recv_amounts.std() if len(recv_amounts) > 1 else 0
                
                # Net flow (negative = more outgoing)
                feats['net_flow'] = feats['total_received'] - feats['total_sent']
                
                # Round amount ratio
                all_amounts = pd.concat([sent_amounts, recv_amounts])
                if len(all_amounts) > 0:
                    round_count = sum(1 for a in all_amounts if self._is_round_amount(a))
                    feats['round_amount_ratio'] = round_count / len(all_amounts)
                else:
                    feats['round_amount_ratio'] = 0
                
                # Threshold proximity ratio
                if len(all_amounts) > 0:
                    near_threshold = sum(1 for a in all_amounts if self._near_ctr_threshold(a))
                    feats['threshold_proximity_ratio'] = near_threshold / len(all_amounts)
                else:
                    feats['threshold_proximity_ratio'] = 0
            
            # Unique counterparties
            if source_col in df.columns and target_col in df.columns:
                feats['unique_recipients'] = sent_df[target_col].nunique() if len(sent_df) > 0 else 0
                feats['unique_senders'] = recv_df[source_col].nunique() if len(recv_df) > 0 else 0
                
                # Fan-out ratio (unique recipients / total sent TXs)
                feats['fan_out_ratio'] = feats['unique_recipients'] / max(feats['out_degree'], 1)
                feats['fan_in_ratio'] = feats['unique_senders'] / max(feats['in_degree'], 1)
            
            # Temporal features
            if time_col in df.columns:
                all_times = pd.concat([sent_df[[time_col]], recv_df[[time_col]]])[time_col]
                all_times = pd.to_datetime(all_times, errors='coerce').dropna().sort_values()
                
                if len(all_times) >= 2:
                    # Activity span
                    span = (all_times.max() - all_times.min()).total_seconds()
                    feats['activity_span_hours'] = span / 3600
                    
                    # Average time between TXs
                    diffs = all_times.diff().dropna().dt.total_seconds()
                    feats['avg_time_between_txs'] = diffs.mean()
                    feats['min_time_between_txs'] = diffs.min()
                    feats['std_time_between_txs'] = diffs.std() if len(diffs) > 1 else 0
                    
                    # Regularity score (low std / mean = very regular = bot-like)
                    if feats['avg_time_between_txs'] > 0:
                        feats['regularity_score'] = 1.0 - min(1.0, feats['std_time_between_txs'] / feats['avg_time_between_txs'])
                    else:
                        feats['regularity_score'] = 0
                    
                    # Burst score (max TXs in any 1-hour window / total TXs)
                    feats['burst_score'] = self._compute_burst_score(all_times)
                    
                    # Hour distribution entropy
                    feats['hour_entropy'] = self._compute_hour_entropy(all_times)
                else:
                    feats['activity_span_hours'] = 0
                    feats['avg_time_between_txs'] = 0
                    feats['min_time_between_txs'] = 0
                    feats['std_time_between_txs'] = 0
                    feats['regularity_score'] = 0
                    feats['burst_score'] = 0
                    feats['hour_entropy'] = 0
            
            wallet_features.append(feats)
        
        return pd.DataFrame(wallet_features)
    
    # =========================================================================
    # Amount Features
    # =========================================================================
    
    def _compute_amount_features(self, df: pd.DataFrame, amount_col: str) -> pd.DataFrame:
        """Per-transaction amount-based features."""
        amounts = df[amount_col].astype(float)
        
        # Is round amount (e.g., 1000, 5000, 9999)
        df['is_round_amount'] = amounts.apply(self._is_round_amount).astype(int)
        
        # Near CTR threshold (90-100% of threshold)
        df['near_ctr_threshold'] = amounts.apply(self._near_ctr_threshold).astype(int)
        
        # Exact threshold evasion (95-99.9% of threshold)
        df['ctr_evasion_score'] = amounts.apply(self._ctr_evasion_score)
        
        # Amount percentile within dataset
        df['amount_percentile'] = amounts.rank(pct=True)
        
        # Log amount (handles scale variation)
        df['log_amount'] = np.log1p(amounts.clip(lower=0))
        
        return df
    
    def _compute_wallet_amount_stats(
        self, df: pd.DataFrame, source_col: str, target_col: str, amount_col: str
    ) -> pd.DataFrame:
        """Per-transaction features based on wallet-level amount statistics."""
        amounts = df[amount_col].astype(float)
        
        # Compute wallet-level stats
        if source_col in df.columns:
            wallet_stats = df.groupby(source_col)[amount_col].agg(['mean', 'std', 'count']).reset_index()
            wallet_stats.columns = [source_col, 'wallet_avg_sent', 'wallet_std_sent', 'wallet_tx_count']
            df = df.merge(wallet_stats, on=source_col, how='left')
            
            # Deviation from wallet average (outlier detection)
            df['amount_deviation'] = np.abs(amounts - df['wallet_avg_sent'].fillna(0)) / df['wallet_std_sent'].fillna(1).clip(lower=0.01)
        
        return df
    
    # =========================================================================
    # Velocity Features
    # =========================================================================
    
    def _compute_velocity_features(
        self, df: pd.DataFrame, source_col: str, target_col: str, time_col: str
    ) -> pd.DataFrame:
        """Transaction velocity: how many TXs per wallet in various time windows."""
        df_sorted = df.sort_values(time_col)
        ts = pd.to_datetime(df_sorted[time_col], errors='coerce')
        
        # For each transaction, count how many TXs the sender made in the last N hours
        for window_hours in [1, 6, 24]:
            col_name = f'sender_velocity_{window_hours}h'
            velocities = []
            
            for idx, row in df_sorted.iterrows():
                sender = row[source_col]
                tx_time = ts[idx]
                
                if pd.isna(tx_time):
                    velocities.append(0)
                    continue
                
                window_start = tx_time - timedelta(hours=window_hours)
                
                # Count sender's TXs in window
                sender_txs = df_sorted[
                    (df_sorted[source_col] == sender) &
                    (ts >= window_start) &
                    (ts <= tx_time)
                ]
                velocities.append(len(sender_txs))
            
            df[col_name] = velocities
        
        return df
    
    # =========================================================================
    # Burst Detection
    # =========================================================================
    
    def _compute_burst_features(
        self, df: pd.DataFrame, source_col: str, time_col: str
    ) -> pd.DataFrame:
        """Detect burst patterns: sudden spikes in transaction frequency."""
        ts = pd.to_datetime(df[time_col], errors='coerce')
        
        burst_scores = []
        for idx, row in df.iterrows():
            sender = row[source_col]
            tx_time = ts[idx]
            
            if pd.isna(tx_time):
                burst_scores.append(0.0)
                continue
            
            # Count TXs in 30-minute window before this TX
            window_start = tx_time - timedelta(minutes=30)
            recent_txs = df[
                (df[source_col] == sender) &
                (ts >= window_start) &
                (ts <= tx_time)
            ]
            
            # Burst score: exponential based on count (3+ in 30 min = suspicious)
            count = len(recent_txs)
            if count >= 5:
                burst_scores.append(1.0)
            elif count >= 3:
                burst_scores.append(0.7)
            elif count >= 2:
                burst_scores.append(0.3)
            else:
                burst_scores.append(0.0)
        
        df['burst_score'] = burst_scores
        return df
    
    # =========================================================================
    # Temporal Regularity (Bot Detection)
    # =========================================================================
    
    def _compute_regularity_features(
        self, df: pd.DataFrame, source_col: str, time_col: str
    ) -> pd.DataFrame:
        """
        Detect regular intervals between TXs (bot/automated behavior).
        Low variance in inter-TX intervals = likely automated.
        """
        ts = pd.to_datetime(df[time_col], errors='coerce')
        
        regularity_scores = []
        for idx, row in df.iterrows():
            sender = row[source_col]
            
            sender_txs = df[df[source_col] == sender]
            sender_times = pd.to_datetime(sender_txs[time_col], errors='coerce').dropna().sort_values()
            
            if len(sender_times) < 3:
                regularity_scores.append(0.0)
                continue
            
            # Compute inter-TX intervals
            diffs = sender_times.diff().dropna().dt.total_seconds()
            
            if len(diffs) < 2 or diffs.mean() == 0:
                regularity_scores.append(0.0)
                continue
            
            # Coefficient of variation (CV = std/mean)
            # Low CV = regular intervals = suspicious
            cv = diffs.std() / diffs.mean()
            regularity = max(0, 1.0 - cv)  # 1.0 = perfectly regular
            
            regularity_scores.append(min(regularity, 1.0))
        
        df['regularity_score'] = regularity_scores
        return df
    
    # =========================================================================
    # Time-of-Day Features
    # =========================================================================
    
    def _compute_time_of_day_features(self, df: pd.DataFrame, time_col: str) -> pd.DataFrame:
        """
        Time-of-day features. Transactions at unusual hours are suspicious.
        """
        ts = pd.to_datetime(df[time_col], errors='coerce')
        
        df['tx_hour'] = ts.dt.hour.fillna(12).astype(int)
        df['tx_day_of_week'] = ts.dt.dayofweek.fillna(0).astype(int)
        
        # Is off-hours (midnight to 6 AM or after 10 PM)
        df['is_off_hours'] = ((df['tx_hour'] < 6) | (df['tx_hour'] >= 22)).astype(int)
        
        # Is weekend
        df['is_weekend'] = (df['tx_day_of_week'] >= 5).astype(int)
        
        # Cyclical encoding of hour (preserves 23→0 continuity)
        df['hour_sin'] = np.sin(2 * np.pi * df['tx_hour'] / 24)
        df['hour_cos'] = np.cos(2 * np.pi * df['tx_hour'] / 24)
        
        return df
    
    # =========================================================================
    # Dormancy Features
    # =========================================================================
    
    def _compute_dormancy_features(
        self, df: pd.DataFrame, source_col: str, time_col: str
    ) -> pd.DataFrame:
        """
        Detect dormancy patterns: long idle → sudden activity = suspicious.
        Compromised accounts often show this pattern.
        """
        ts = pd.to_datetime(df[time_col], errors='coerce')
        df_sorted = df.sort_values(time_col)
        
        dormancy_scores = []
        for idx, row in df_sorted.iterrows():
            sender = row[source_col]
            tx_time = ts[idx]
            
            if pd.isna(tx_time):
                dormancy_scores.append(0.0)
                continue
            
            # Find previous TX by this sender
            prev_txs = df_sorted[
                (df_sorted[source_col] == sender) &
                (ts < tx_time)
            ]
            
            if len(prev_txs) == 0:
                # First TX by this wallet — can't compute dormancy
                dormancy_scores.append(0.0)
                continue
            
            last_tx_time = pd.to_datetime(prev_txs[time_col].iloc[-1])
            gap_hours = (tx_time - last_tx_time).total_seconds() / 3600
            
            # Score: long gap followed by activity = suspicious
            if gap_hours > 720:  # 30+ days
                dormancy_scores.append(1.0)
            elif gap_hours > 168:  # 7+ days
                dormancy_scores.append(0.7)
            elif gap_hours > 48:  # 2+ days
                dormancy_scores.append(0.3)
            else:
                dormancy_scores.append(0.0)
        
        df['dormancy_reactivation_score'] = dormancy_scores
        return df
    
    # =========================================================================
    # Helper Functions
    # =========================================================================
    
    def _detect_column(self, df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
        """Find the first matching column name from candidates."""
        for col in candidates:
            if col in df.columns:
                return col
        return None
    
    def _parse_timestamps(self, df: pd.DataFrame, time_col: str) -> pd.DataFrame:
        """Parse timestamp column to datetime."""
        df[time_col] = pd.to_datetime(df[time_col], errors='coerce')
        return df
    
    def _is_round_amount(self, amount: float) -> bool:
        """Check if amount is suspiciously round (e.g., 1000, 5000, 9999)."""
        if amount <= 0:
            return False
        # Check if divisible by 100, 500, or 1000
        return (amount % 100 == 0) or (amount % 500 == 0) or (amount % 1000 == 0)
    
    def _near_ctr_threshold(self, amount: float) -> bool:
        """Check if amount is near a CTR reporting threshold."""
        threshold = self.ctr_threshold
        return threshold * 0.90 <= amount <= threshold * 1.0
    
    def _ctr_evasion_score(self, amount: float) -> float:
        """
        Score how close an amount is to the CTR threshold.
        Returns 0-1 where 1 = exactly at threshold.
        """
        threshold = self.ctr_threshold
        if amount <= 0 or amount > threshold:
            return 0.0
        
        ratio = amount / threshold
        if ratio >= 0.95:
            return min(1.0, (ratio - 0.90) / 0.10)  # Linear scale 0.90-1.0 → 0-1
        elif ratio >= 0.80:
            return (ratio - 0.80) / 0.30  # Gradual increase
        return 0.0
    
    def _compute_burst_score(self, timestamps: pd.Series) -> float:
        """
        Compute burst score: max TXs in any 1-hour window / total TXs.
        High ratio = bursty behavior = suspicious.
        """
        if len(timestamps) < 2:
            return 0.0
        
        timestamps = timestamps.sort_values()
        max_in_window = 0
        
        for i, t in enumerate(timestamps):
            window_end = t + timedelta(hours=1)
            count = ((timestamps >= t) & (timestamps <= window_end)).sum()
            max_in_window = max(max_in_window, count)
        
        return min(1.0, max_in_window / len(timestamps))
    
    def _compute_hour_entropy(self, timestamps: pd.Series) -> float:
        """
        Compute entropy of transaction hour distribution.
        Low entropy = concentrated in few hours = suspicious pattern.
        """
        hours = timestamps.dt.hour
        if len(hours) == 0:
            return 0.0
        
        # Count per hour
        hour_counts = hours.value_counts(normalize=True)
        
        # Shannon entropy
        entropy = -sum(p * np.log2(p + 1e-10) for p in hour_counts.values)
        
        # Normalize to [0, 1] (max entropy for 24 hours = log2(24) ≈ 4.58)
        max_entropy = np.log2(24)
        return entropy / max_entropy if max_entropy > 0 else 0.0


def enrich_wallet_graph_features(
    transactions_df: pd.DataFrame,
    existing_features: np.ndarray,
    wallet_ids: List[str],
    source_col: str = 'Source_Wallet_ID',
    target_col: str = 'Dest_Wallet_ID',
    amount_col: str = 'Amount',
    time_col: str = 'Timestamp',
) -> np.ndarray:
    """
    Enrich existing wallet node features with temporal features.
    
    This function is designed to be called from ml_service.py to augment
    the basic wallet features (degree, amount) with temporal features
    before running the GNN model.
    
    Args:
        transactions_df: Raw transaction data
        existing_features: Current feature matrix (N × D)
        wallet_ids: List of wallet IDs corresponding to rows
        source_col, target_col, amount_col, time_col: Column names
        
    Returns:
        Augmented feature matrix (N × D') where D' > D
    """
    engineer = TemporalFeatureEngineer()
    
    # Check if timestamp column exists
    if time_col not in transactions_df.columns:
        return existing_features
    
    # Compute per-wallet temporal features
    wallet_df = engineer.compute_wallet_features(
        transactions_df, source_col, target_col, amount_col, time_col
    )
    
    if len(wallet_df) == 0:
        return existing_features
    
    # Select numeric temporal features to add
    temporal_cols = [
        'round_amount_ratio', 'threshold_proximity_ratio',
        'activity_span_hours', 'avg_time_between_txs', 'min_time_between_txs',
        'regularity_score', 'burst_score', 'hour_entropy',
        'net_flow', 'fan_out_ratio', 'fan_in_ratio',
        'std_sent', 'std_received',
    ]
    
    available_cols = [c for c in temporal_cols if c in wallet_df.columns]
    
    if not available_cols:
        return existing_features
    
    # Create wallet_id → feature mapping
    wallet_to_features = {}
    for _, row in wallet_df.iterrows():
        wid = str(row['wallet_id'])
        feats = [float(row.get(c, 0) or 0) for c in available_cols]
        wallet_to_features[wid] = feats
    
    # Build temporal feature matrix aligned with wallet_ids
    num_wallets = len(wallet_ids)
    num_temporal = len(available_cols)
    temporal_matrix = np.zeros((num_wallets, num_temporal), dtype=np.float32)
    
    for i, wid in enumerate(wallet_ids):
        if str(wid) in wallet_to_features:
            temporal_matrix[i] = wallet_to_features[str(wid)]
    
    # Normalize temporal features (z-score)
    for col in range(num_temporal):
        col_data = temporal_matrix[:, col]
        mean = col_data.mean()
        std = col_data.std()
        if std > 0:
            temporal_matrix[:, col] = (col_data - mean) / std
        else:
            temporal_matrix[:, col] = 0
    
    # Clip extremes
    temporal_matrix = np.clip(temporal_matrix, -5.0, 5.0)
    
    # Replace NaN with 0
    temporal_matrix = np.nan_to_num(temporal_matrix, nan=0.0)
    
    # Concatenate with existing features
    augmented = np.hstack([existing_features, temporal_matrix])
    
    return augmented
