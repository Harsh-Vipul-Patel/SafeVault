const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/auth');

const token = jwt.sign({ id: 'CUST-002', role: 'CUSTOMER', username: 'john_doe' }, JWT_SECRET, { expiresIn: '1h' });

async function testTransfer() {
    try {
        const res = await fetch('http://localhost:5000/api/customer/transfer/internal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fromAccountId: "ACC-MUM-003-8821",
                toAccountId: "ACC-MUM-003-8822",
                amount: 1,
                otpCode: "123456" // Assuming a fake OTP match
            })
        });
        console.log(res.status);
        const data = await res.json();
        console.log("Response:", data);
    } catch (e) {
        console.log("Error:", e);
    }
}
testTransfer();
