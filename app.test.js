const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('./app'); 
const config = require('./config');

describe('Registration Endpoint', () => {
  it('should register a new user successfully', async () => {
    const userData = { username: 'testuser', password: 'password', email: 'test@example.com' };
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue(hashedPassword);
    const poolQueryMock = jest.spyOn(app.get('pool'), 'query').mockResolvedValue({ rows: [{ ...userData, password: hashedPassword }] });

    const res = await request(app)
      .post('/register')
      .send(userData);
    
    expect(res.statusCode).toEqual(201);
    expect(res.body.message).toEqual('User registered successfully');
    expect(res.body.user).toEqual(expect.objectContaining(userData));
    expect(poolQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.any(String),
      values: expect.arrayContaining([userData.username, hashedPassword, userData.email]),
    }));
  });

  it('should handle registration errors gracefully', async () => {
    jest.spyOn(bcrypt, 'hash').mockRejectedValue(new Error('bcrypt error'));
    const res = await request(app)
      .post('/register')
      .send({ username: 'testuser', password: 'password', email: 'test@example.com' });

    expect(res.statusCode).toEqual(500);
    expect(res.body.message).toEqual('Error during registration');
  });

  it('should handle database query errors gracefully', async () => {
    const userData = { username: 'testuser', password: 'password', email: 'test@example.com' };
    jest.spyOn(bcrypt, 'hash').mockResolvedValue(userData.password);
    jest.spyOn(app.get('pool'), 'query').mockRejectedValue(new Error('database error'));

    const res = await request(app)
      .post('/register')
      .send(userData);

    expect(res.statusCode).toEqual(500);
    expect(res.body.message).toEqual('Error during registration');
  });

  it('should reject registration with missing username', async () => {
    const res = await request(app)
      .post('/register')
      .send({ password: 'password', email: 'test@example.com' });

    expect(res.statusCode).toEqual(500);
    expect(res.body.message).toEqual('Error during registration');
  });

  it('should reject registration with invalid email', async () => {
    const res = await request(app)
      .post('/register')
      .send({ username: 'testuser', password: 'password', email: 'invalid-email' });

    expect(res.statusCode).toEqual(500);
    expect(res.body.message).toEqual('Error during registration');
  });
});



describe('Login Endpoint', () => {
  it('should login with correct credentials', async () => {
    // Mock request body
    const req = { body: { username: 'testuser', password: 'password' } };
    
    // Mock user data from the database
    const userData = { user_id: 1, username: 'testuser', password: await bcrypt.hash('password', 10) };
    jest.spyOn(app.get('pool'), 'query').mockResolvedValue({ rows: [userData] });
    
    // Mock response object
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    // Call the endpoint
    await app.post('/login')(req, res);

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Login successful', token: expect.any(String) });
  });

  it('should reject login with incorrect password', async () => {
    // Mock request body
    const req = { body: { username: 'testuser', password: 'wrongpassword' } };
    
    // Mock user data from the database
    const userData = { user_id: 1, username: 'testuser', password: await bcrypt.hash('password', 10) };
    jest.spyOn(app.get('pool'), 'query').mockResolvedValue({ rows: [userData] });
    
    // Mock response object
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    // Call the endpoint
    await app.post('/login')(req, res);

    // Verify response
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid password' });
  });

  it('should handle login errors gracefully', async () => {
    // Mock request body
    const req = { body: { username: 'testuser', password: 'password' } };
    
    // Mock database query to reject with an error
    jest.spyOn(app.get('pool'), 'query').mockRejectedValue(new Error('database error'));
    
    // Mock response object
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    // Call the endpoint
    await app.post('/login')(req, res);

    // Verify response
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Error during login' });
  });

});



const WebSocket = require('ws');
const http = require('http');
const { Server } = require('http');
const { v4: uuidv4 } = require('uuid');

// Function to create a WebSocket server
function createWebSocketServer(port, callback) {
    const server = http.createServer();
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('WebSocket connection established');
        callback(ws);
    });

    server.listen(port, () => {
        console.log(`WebSocket server running on port ${port}`);
    });

    return wss;
}

// Mock data for testing
const testUserId = uuidv4();
const testConversationId = uuidv4();
const testContent = 'Test message';

describe('WebSocket Endpoint', () => {
    let ws;
    let wss;

    // Setup WebSocket server before each test
    beforeEach(() => {
        wss = createWebSocketServer(3000, (client) => {
            ws = client;
        });
    });

    // Close WebSocket server after each test
    afterEach(() => {
        wss.close();
    });

    it('should establish WebSocket connection', (done) => {
        ws.on('open', () => {
            expect(ws.readyState).toEqual(WebSocket.OPEN);
            done();
        });
    });

    it('should handle message sending', (done) => {
        ws.on('message', (message) => {
            const data = JSON.parse(message);
            expect(data.userId).toEqual(testUserId);
            expect(data.conversationId).toEqual(testConversationId);
            expect(data.content).toEqual(testContent);
            done();
        });

        // Simulate sending a message
        ws.send(JSON.stringify({
            userId: testUserId,
            conversationId: testConversationId,
            content: testContent
        }));
    });

    it('should handle errors gracefully', (done) => {
        ws.on('message', () => {
            // Simulate sending an invalid message
            ws.send('Invalid message');

            // Delay to allow time for error event
            setTimeout(() => {
                done();
            }, 100);
        });

        ws.on('error', (error) => {
            // Verify that error is handled gracefully
            expect(error).toBeDefined();
            done();
        });
    });
});



const { Kafka } = require('kafkajs');
const { userMessageCounts } = require('./app'); 

describe('User Message Counts', () => {
    let mockConsumer;

    beforeEach(() => {
        // Mock the Kafka consumer
        mockConsumer = jest.fn();

        // Mock the run method of the Kafka consumer
        mockConsumer.run = jest.fn(({ eachMessage }) => {
            // Simulate receiving messages and invoking the callback
            const messages = [
                { value: JSON.stringify({ sender_id: 'user1' }) },
                { value: JSON.stringify({ sender_id: 'user2' }) },
                { value: JSON.stringify({ sender_id: 'user1' }) }
            ];
            messages.forEach(message => eachMessage({ topic: 'chat-messages', partition: 0, message }));
        });
    });

    afterEach(() => {
        // Reset userMessageCounts after each test
        Object.keys(userMessageCounts).forEach(key => delete userMessageCounts[key]);
    });

    it('should increment message count for each user', async () => {
        // Run the consumer and process messages
        await mockConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const newMessage = JSON.parse(message.value.toString());
                userMessageCounts[newMessage.sender_id] = (userMessageCounts[newMessage.sender_id] || 0) + 1;
            },
        });

        // Check if message counts are updated correctly
        expect(userMessageCounts['user1']).toBe(2);
        expect(userMessageCounts['user2']).toBe(1);
    });

    it('should handle empty message', async () => {
        // Simulate receiving an empty message
        await mockConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                // Ignore empty messages
                if (!message.value) return;
                
                const newMessage = JSON.parse(message.value.toString());
                userMessageCounts[newMessage.sender_id] = (userMessageCounts[newMessage.sender_id] || 0) + 1;
            },
        });

        // Check if userMessageCounts remains unchanged
        expect(Object.keys(userMessageCounts)).toHaveLength(0);
    });

    it('should handle invalid message format', async () => {
        // Simulate receiving an invalid message format
        await mockConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const newMessage = JSON.parse(message.value.toString());
                    userMessageCounts[newMessage.sender_id] = (userMessageCounts[newMessage.sender_id] || 0) + 1;
                } catch (error) {
                    // Handle invalid message format
                    console.error('Invalid message format:', error);
                }
            },
        });

        // Check if userMessageCounts remains unchanged
        expect(Object.keys(userMessageCounts)).toHaveLength(0);
    });

    it('should handle Kafka consumer error', async () => {
        // Mock the run method of the Kafka consumer to throw an error
        mockConsumer.run.mockRejectedValue(new Error('Kafka consumer error'));

        // Run the consumer and handle errors
        await mockConsumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                // Process messages
                const newMessage = JSON.parse(message.value.toString());
                userMessageCounts[newMessage.sender_id] = (userMessageCounts[newMessage.sender_id] || 0) + 1;
            },
        });

        // Check if userMessageCounts remains unchanged
        expect(Object.keys(userMessageCounts)).toHaveLength(0);
    });
});



const { retrieveMessagesFromDatabase, handleRecentMessages } = require('./app');

// Mocking the dependencies
jest.mock('redis', () => {
    const mockClient = {
        lrange: jest.fn(),
        multi: jest.fn(() => ({
            lpush: jest.fn(),
            ltrim: jest.fn(),
            exec: jest.fn(),
        })),
    };
    return {
        createClient: jest.fn(() => mockClient),
    };
});

jest.mock('pg', () => {
    const mockPool = {
        query: jest.fn(),
    };
    return {
        Pool: jest.fn(() => mockPool),
    };
});

describe('Message Retrieval', () => {
    beforeEach(() => {
        jest.clearAllMocks(); // Reset mocks before each test
    });

    it('should retrieve recent messages from Redis', async () => {
        // Mocking Redis client response
        const mockCachedMessages = ['{"id": 1, "content": "Hello"}', '{"id": 2, "content": "World"}'];
        const mockRedisClient = require('redis').createClient();
        mockRedisClient.lrange.mockImplementationOnce((key, start, stop, callback) => {
            callback(null, mockCachedMessages);
        });

        // Invoke the function under test
        await retrieveMessagesFromDatabase();

        // Assert that the messages are handled
        expect(handleRecentMessages).toHaveBeenCalledWith([
            { id: 1, content: 'Hello' },
            { id: 2, content: 'World' },
        ]);
    });

    it('should fallback to database when Redis retrieval fails', async () => {
        // Mocking Redis client error
        const mockRedisClient = require('redis').createClient();
        mockRedisClient.lrange.mockImplementationOnce((key, start, stop, callback) => {
            callback(new Error('Redis error'), null);
        });

        // Invoke the function under test
        await retrieveMessagesFromDatabase();

        // Assert that the database retrieval is triggered
        expect(require('pg').Pool().query).toHaveBeenCalled();
    });

    it('should cache messages in Redis after database retrieval', async () => {
        // Mocking database query response
        const mockRecentMessages = [{ id: 1, content: 'Hello' }, { id: 2, content: 'World' }];
        const mockPool = require('pg').Pool();
        mockPool.query.mockResolvedValueOnce({ rows: mockRecentMessages });

        // Invoke the function under test
        await retrieveMessagesFromDatabase();

        // Assert that messages are cached in Redis
        expect(require('redis').createClient().multi().lpush).toHaveBeenCalledWith(
            'conversation:1:messages',
            '{"id":1,"content":"Hello"}'
        );
        expect(require('redis').createClient().multi().lpush).toHaveBeenCalledWith(
            'conversation:1:messages',
            '{"id":2,"content":"World"}'
        );
    });

    it('should trim cached messages in Redis after database retrieval', async () => {
        // Mocking database query response
        const mockRecentMessages = Array.from({ length: 15 }, (_, i) => ({ id: i, content: `Message ${i}` }));
        const mockPool = require('pg').Pool();
        mockPool.query.mockResolvedValueOnce({ rows: mockRecentMessages });

        // Invoke the function under test
        await retrieveMessagesFromDatabase();

        // Assert that Redis list is trimmed to keep the latest 10 messages
        expect(require('redis').createClient().multi().ltrim).toHaveBeenCalledWith(
            'conversation:1:messages',
            0,
            9
        );
    });

    it('should handle database retrieval error', async () => {
        // Mocking database query error
        const mockPool = require('pg').Pool();
        mockPool.query.mockRejectedValueOnce(new Error('Database error'));

        // Invoke the function under test
        await retrieveMessagesFromDatabase();

        // Assert that error is logged
        expect(console.error).toHaveBeenCalledWith('Error retrieving messages from database:', expect.any(Error));
    });

    it('should handle Redis caching error', async () => {
        // Mocking database query response
        const mockRecentMessages = [{ id: 1, content: 'Hello' }, { id: 2, content: 'World' }];
        const mockPool = require('pg').Pool();
        mockPool.query.mockResolvedValueOnce({ rows: mockRecentMessages });

        // Mocking Redis client error
        const mockRedisClient = require('redis').createClient();
        mockRedisClient.multi().exec.mockRejectedValueOnce(new Error('Redis caching error'));

        // Invoke the function under test
        await retrieveMessagesFromDatabase();

        // Assert that error is logged
        expect(console.error).toHaveBeenCalledWith('Error retrieving messages from database:', expect.any(Error));
    });
});
