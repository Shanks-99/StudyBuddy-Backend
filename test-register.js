const axios = require('axios');

async function testRegister() {
    try {
        const response = await axios.post('http://localhost:5000/api/auth/register', {
            name: 'Test User',
            email: 'testuser@example.com',
            password: 'Test123',
            role: 'student'
        });
        console.log('✅ Registration successful:', response.data);
    } catch (error) {
        console.error('❌ Registration failed:');
        console.error('Status:', error.response?.status);
        console.error('Message:', error.response?.data);
        console.error('Full error:', error.message);
    }
}

testRegister();
