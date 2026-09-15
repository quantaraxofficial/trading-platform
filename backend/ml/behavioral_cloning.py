import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import pandas as pd
from data_loader import fetch_telemetry_data, preprocess_for_behavioral_cloning

class TradingBotImitationModel(nn.Module):
    """
    A simple Feed-Forward Neural Network to predict user actions based on state.
    State Size: 3 (timeframe, active_longs, active_shorts)
    Action Size: 4 (TIMEFRAME_CHANGED, DRAWING_ADDED, DRAWING_MODIFIED, DRAWING_DELETED)
    """
    def __init__(self, input_size=3, hidden_size=64, num_classes=4):
        super(TradingBotImitationModel, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, num_classes)
        )
        
    def forward(self, x):
        return self.network(x)

def train_imitation_model(epochs=50, batch_size=16):
    print("Fetching Telemetry Data from Django...")
    df = fetch_telemetry_data()
    
    if df.empty or len(df) < 5:
        print("Not enough data to train. Go backtest some more!")
        return
        
    print(f"Loaded {len(df)} telemetry events. Preprocessing...")
    X_df, y_series = preprocess_for_behavioral_cloning(df)
    
    # Convert to PyTorch Tensors
    X_tensor = torch.FloatTensor(X_df.values)
    y_tensor = torch.LongTensor(y_series.values)
    
    # Create Dataset and DataLoader
    dataset = TensorDataset(X_tensor, y_tensor)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
    
    # Initialize Model, Loss, and Optimizer
    model = TradingBotImitationModel()
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    print("Starting Training Loop...")
    for epoch in range(epochs):
        epoch_loss = 0
        correct = 0
        total = 0
        
        for batch_X, batch_y in dataloader:
            # 1. Forward pass
            predictions = model(batch_X)
            loss = criterion(predictions, batch_y)
            
            # 2. Backward pass and optimization
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            epoch_loss += loss.item()
            
            # Calculate accuracy
            _, predicted = torch.max(predictions.data, 1)
            total += batch_y.size(0)
            correct += (predicted == batch_y).sum().item()
            
        if (epoch + 1) % 10 == 0:
            acc = 100 * correct / total
            print(f"Epoch [{epoch+1}/{epochs}], Loss: {epoch_loss/len(dataloader):.4f}, Accuracy: {acc:.2f}%")
            
    print("Training Complete! Saving weights...")
    torch.save(model.state_dict(), "trading_bot_imitation_weights.pth")
    print("Model saved to 'trading_bot_imitation_weights.pth'")

if __name__ == "__main__":
    train_imitation_model()
