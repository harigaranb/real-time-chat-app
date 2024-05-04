-- Users Table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations Table
CREATE TABLE conversations (
    conversation_id SERIAL PRIMARY KEY,
    participant1_id INT REFERENCES users(user_id),
    participant2_id INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages Table
CREATE TABLE messages (
    message_id SERIAL PRIMARY KEY,
    conversation_id INT REFERENCES conversations(conversation_id),
    sender_id INT REFERENCES users(user_id),
    content TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_conversations_participant1_id ON conversations(participant1_id);
CREATE INDEX idx_conversations_participant2_id ON conversations(participant2_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
