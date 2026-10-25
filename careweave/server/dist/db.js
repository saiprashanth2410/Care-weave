import mongoose from 'mongoose';
import 'dotenv/config';
export async function connectDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri)
        throw new Error('MONGODB_URI is not set. Copy .env.example to .env.');
    await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'careweave', serverSelectionTimeoutMS: 8000 });
    return mongoose.connection;
}
