## Real-Time Chat Application

### Overview
The Real-Time Chat Application is a scalable and efficient platform designed to facilitate private one-on-one messaging between users. It ensures real-time communication without noticeable lag, even with a significant number of concurrent users.

### API Endpoints

#### Register Endpoint
- **Method:** POST
- **Path:** /register
- **Description:** Register a new user with a username, password, and email.
- **Request Body:**
    - username: String (required)
    - password: String (required)
    - email: String (required)
- **Response:**
    - Status 201: User registered successfully
    - Status 500: Error during registration

#### Login Endpoint
- **Method:** POST
- **Path:** /login
- **Description:** Log in a user with a username and password.
- **Request Body:**
    - username: String (required)
    - password: String (required)
- **Response:**
    - Status 200: Login successful
    - Status 401: Invalid password
    - Status 404: User not found
    - Status 500: Error during login

#### WebSocket Endpoint
- **Path:** /chat
- **Description:** WebSocket endpoint for private chats.
- **Functionality:** Allows users to send and receive real-time messages in a private chat.
- **Authorization:** Requires a valid JWT token in the request headers.

### Setup Instructions

1. **Install Dependencies:** Run `npm install` to install all required dependencies.

2. **Environment Configuration:** Ensure that the configuration file (config.js) contains necessary configurations for the database, Kafka, Redis, JWT secret key, and server port.

3. **SSL/TLS Certificate:** Provide SSL/TLS certificate and private key files (certificate.crt and private.key) in the certificate directory.

4. **Start Server:** Run `npm start` to start the HTTPS server.

### Run Tests

1. **Install Jest:** If Jest is not installed globally, install it locally using `npm install --save-dev jest`.

2. **Run Tests:** Execute `npm test` to run all test suites. Jest will automatically look for files with .test.js extension and execute the tests.

3. **Test Coverage:** To generate test coverage reports, run `npm test -- --coverage`. Coverage reports will be generated in the coverage directory.

4. **Review Test Results:** After running tests, review the test results in the console. Any failures or errors will be displayed along with the stack trace.
