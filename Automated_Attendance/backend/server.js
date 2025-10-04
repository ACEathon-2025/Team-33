const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/ping', (req, res) => res.json({ msg: 'pong' }));

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
