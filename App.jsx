import React from 'react';
import BinaryWave from './BinaryWave';

function App() {
    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0,
            overflow: 'hidden',
            background: '#000',
        }}>
            <BinaryWave />
        </div>
    );
}

export default App;
