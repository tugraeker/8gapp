async function verify() {
    try {
        console.log('Testing login for kayra.i̇...');
        const res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'kayra.i̇',
                password: 'sifre9827'
            })
        });
        const data = await res.json();
        if (res.ok) {
            console.log('Login Success for kayra.i̇:', data.user.name);
        } else {
            console.error('Login Failed for kayra.i̇:', data);
        }

    } catch (err) {
        console.error('Error during verification:', err.message);
    }
}

verify();
