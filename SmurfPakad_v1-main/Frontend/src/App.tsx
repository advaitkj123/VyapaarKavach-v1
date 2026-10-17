import React, { FC } from 'react';
interface AppProps {}

const App: FC<AppProps> = () => {
  const [count, setCount] = React.useState<number>(0);

  const handleIncrement = (): void => {
    setCount(count + 1);
  };

  const handleDecrement = (): void => {
    setCount(count - 1);
  };

  const handleReset = (): void => {
    setCount(0);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to TriStack Overflow</h1>
        <p>A community platform for developers</p>
      </header>

      <main className="App-main">
        <section className="counter-section">
          <h2>Counter Demo</h2>
          <div className="counter-display">
            <p>Count: <span className="counter-value">{count}</span></p>
          </div>
          <div className="button-group">
            <button onClick={handleDecrement} className="btn btn-secondary">
              Decrease
            </button>
            <button onClick={handleReset} className="btn btn-warning">
              Reset
            </button>
            <button onClick={handleIncrement} className="btn btn-primary">
              Increase
            </button>
          </div>
        </section>

        <section className="info-section">
          <h2>Features</h2>
          <ul>
            <li>Built with React 18</li>
            <li>TypeScript for type safety</li>
            <li>Modern component structure</li>
            <li>Responsive design</li>
          </ul>
        </section>
      </main>

      <footer className="App-footer">
        <p>&copy; 2026 TriStack Overflow. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;
