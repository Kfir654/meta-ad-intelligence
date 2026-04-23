import dotenv from 'dotenv';
import { Server } from 'http';
import app from './app';
import connectDB from './config/db';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

connectDB()
  .then(() => {
    const server: Server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    server.setTimeout(150000);
  })
  .catch((err: Error) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
