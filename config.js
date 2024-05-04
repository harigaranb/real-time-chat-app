module.exports = {
    secretKey: 'my-application-secret-key',
    db: {
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: 'postgres123',
        port: 5432,
    },
    server: {
        port: 3000
    },
    kafka: {
        host: 'localhost:9092'
    },
    redis: {
        host: 'localhost',
        port: 6379
    }
};
