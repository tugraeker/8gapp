async function verify() {
    try {
        console.log('Testing login for tugra.e...');
        const res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'tugra.e',
                password: 'sifre2882'
            })
        });
        const data = await res.json();
        if (res.ok) {
            console.log('Login Success for tugra.e:', data.user.name);
        } else {
            console.error('Login Failed for tugra.e:', data);
        }
        
        console.log('Testing login for ogretmen_8g...');
        const res2 = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'ogretmen_8g',
                password: '8G_Ogretmen2025!'
            })
        });
        const data2 = await res2.json();
        if (res2.ok) {
            console.log('Login Success for ogretmen_8g:', data2.user.name);
        } else {
            console.error('Login Failed for ogretmen_8g:', data2);
        }

    } catch (err) {
        console.error('Error during verification:', err.message);
    }
}

verify();
