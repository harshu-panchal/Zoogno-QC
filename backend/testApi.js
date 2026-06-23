import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const token = jwt.sign({ id: '6999788ed49e8099e8a7b11f', role: 'delivery' }, process.env.JWT_SECRET || 'your_secret_here');

axios.get('http://localhost:5000/api/chat/my-chats', {
  headers: { Authorization: 'Bearer ' + token }
}).then(res => {
  console.log('Success:', JSON.stringify(res.data, null, 2));
}).catch(err => {
  console.error('Error:', err.response?.data || err.message);
});
