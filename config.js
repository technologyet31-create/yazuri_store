// config.js
const config = {
  development: {
    mysql: {
      host: '127.0.0.1',
      user: 'vvvuser',
      password: 's3cret',
      database: 'vvv',
      port: 3306
    },
    port: 3000,
    env: 'development'
  },
  production: {
    mysql: {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT || 3306
    },
    port: process.env.PORT || 3000,
    env: 'production'
  }
};

module.exports = config[process.env.NODE_ENV || 'development'];