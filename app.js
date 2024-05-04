const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { Kafka } = require('kafkajs');
const redis = require('redis');
const WebSocket = require('ws');
const config = require('./config');
const https = require('https');
const fs = require('fs');


const app = express();
const pool = new Pool(config.db);


const kafka = new Kafka({
    clientId: 'my-chat-application',
    brokers: [`${config.kafka.host}`]
});


const redisClient = redis.createClient({
    host: `${config.redis.host}`,
    port: `${config.redis.port}`,
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});


const producer = kafka.producer();
await producer.connect();


const consumer = kafka.consumer({ groupId: 'analytics-group' });

await consumer.connect();
await consumer.subscribe({ topic: 'chat-messages', fromBeginning: true });


app.use(bodyParser.json());

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Register WebSocket connection event
wss.on('connection', (ws) => {
    console.log('Client connected');

    // Handle messages from client
    ws.on('message', (message) => {
        console.log('Received message:', message);
        // Broadcast message to all clients
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Create HTTPS server with SSL/TLS certificate
const options = {
    key: fs.readFileSync('certificate/private.key'),
    cert: fs.readFileSync('certificate/certificate.crt')
};

const server = https.createServer(options, app);

server.listen(config.server.port, () => {
    console.log(`Server is running on port ${config.server.port}`);
});


// Upgrade HTTPS server to support WebSocket
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Register endpoint
app.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = {
            text: 'INSERT INTO users(username, password, email) VALUES($1, $2, $3) RETURNING *',
            values: [username, hashedPassword, email]
        };
        const result = await pool.query(query);
        res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Error during registration' });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const query = {
            text: 'SELECT * FROM users WHERE username = $1',
            values: [username]
        };
        const result = await pool.query(query);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const user = result.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        const token = jwt.sign({ userId: user.user_id, username: user.username }, config.secretKey, { expiresIn: '1h' });
        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// Middleware to verify JWT token
function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(403).json({ message: 'Token not provided' });
    }
    jwt.verify(token, config.secretKey, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Failed to authenticate token' });
        }
        req.userId = decoded.userId;
        next();
    });
}

// WebSocket endpoint for private chats
app.ws('/chat', (ws, req) => {
    console.log('WebSocket connection established');
    const userId = req.userId; // Get userId from JWT token

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const { conversationId, content } = data;
            
            // Check if the conversation exists and the user is part of it
            const conversationQuery = {
                text: 'SELECT * FROM conversations WHERE conversation_id = $1 AND (participant1_id = $2 OR participant2_id = $2)',
                values: [conversationId, userId]
            };
            const conversationResult = await pool.query(conversationQuery);
            if (conversationResult.rows.length === 0) {
                return ws.send(JSON.stringify({ error: 'Conversation not found or user not authorized' }));
            }

            // Insert message into the database
            const insertMessageQuery = {
                text: 'INSERT INTO messages(conversation_id, sender_id, content) VALUES($1, $2, $3) RETURNING *',
                values: [conversationId, userId, content]
            };
            const insertMessageResult = await pool.query(insertMessageQuery);
            const newMessage = insertMessageResult.rows[0];
            
            // Publish message to Kafka topic
            await producer.send({
                topic: 'chat-messages',
                messages: [
                    { value: JSON.stringify(newMessage) }
                ]
            });

            // Cache the message using Redis
            redisClient.set(`message:${newMessage.message_id}`, JSON.stringify(newMessage));
            
            // Broadcast the new message to all participants of the conversation
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(newMessage));
                }
            });
            
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({ error: 'Error handling message' }));
        }
    });

    // Close event
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});


const userMessageCounts = {}; // Object to store message counts for each user

await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
        console.log(`For User Message Count: Topic: ${topic} \t from Partition: ${partition}`);
        const newMessage = JSON.parse(message.value.toString());
        const { sender_id } = newMessage;

        // Increment message count for the sender
        userMessageCounts[sender_id] = (userMessageCounts[sender_id] || 0) + 1;

        // Log message count for each user
        console.log('User Message Counts:', userMessageCounts);
    },
});

const popularKeywords = {}; // Object to store count of each keyword

await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
        console.log(`For Popular Keywords: Topic: ${topic} \t from Partition: ${partition}`);
        const newMessage = JSON.parse(message.value.toString());
        const { content } = newMessage;

        // Extract keywords from message content (You might need more sophisticated logic here)
        const keywords = content.toLowerCase().split(/\s+/);

        // Increment count for each keyword
        keywords.forEach(keyword => {
            popularKeywords[keyword] = (popularKeywords[keyword] || 0) + 1;
        });

        // Log popular keywords
        console.log('Popular Keywords:', popularKeywords);
    },
});



const Sentiment = require('sentiment');
const sentimentAnalyzer = new Sentiment();

await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
        console.log(`For Sentiment Score: Topic: ${topic} \t from Partition: ${partition}`);
        const newMessage = JSON.parse(message.value.toString());
        const { content } = newMessage;

        // Analyze sentiment of message content
        const sentimentScore = sentimentAnalyzer.analyze(content);

        // Log sentiment score
        console.log('Sentiment Score:', sentimentScore);
    },
});


// Example logic to retrieve recent messages for a conversation
const conversationId = 1; // Conversation ID
const messagesKey = `conversation:${conversationId}:messages`;

// Check Redis for cached messages
redisClient.lrange(messagesKey, 0, 10, async (err, cachedMessages) => {
    if (err) {
        console.error('Error retrieving cached messages from Redis:', err);
        // Fallback to database
        await retrieveMessagesFromDatabase();
    } else {
        if (cachedMessages.length > 0) {
            // Found cached messages in Redis
            const recentMessages = cachedMessages.map(message => JSON.parse(message));
            // Handle recent messages
            handleRecentMessages(recentMessages);
        } else {
            // No cached messages found in Redis
            // Fallback to database
            await retrieveMessagesFromDatabase();
        }
    }
});

// Function to retrieve messages from the database (if not found in Redis)
async function retrieveMessagesFromDatabase() {
    try {
        // Query database for recent messages
        const query = {
            text: 'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT 10',
            values: [conversationId]
        };
        const result = await pool.query(query);
        const recentMessages = result.rows;
        
        // Cache the messages in Redis
        const multi = redisClient.multi();
        recentMessages.forEach(message => {
            multi.lpush(messagesKey, JSON.stringify(message));
        });
        multi.ltrim(messagesKey, 0, 10);
        await multi.exec();
        
        // Handle recent messages
        handleRecentMessages(recentMessages);
    } catch (error) {
        console.error('Error retrieving messages from database:', error);
    }
}

// Function to handle recent messages
function handleRecentMessages(recentMessages) {
    // Process recent messages
    console.log('Recent messages:', recentMessages);
}


// Start server
const PORT = config.server.port || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
