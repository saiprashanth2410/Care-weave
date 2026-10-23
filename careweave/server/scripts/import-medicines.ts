import 'dotenv/config';
import mongoose from 'mongoose';
import { importMedicines } from '../src/medicines.js';

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) throw new Error('MONGODB_URI is not set');
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'careweave', serverSelectionTimeoutMS: 8000 });
await importMedicines(true);
await mongoose.disconnect();
