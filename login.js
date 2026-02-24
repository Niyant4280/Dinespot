document.querySelector("form").addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
        alert("Email and password are required!");
        return;
    }

    // All logins now go through the server to ensure valid JWT tokens


    try {
        const response = await fetch(`${window.API_BASE_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem("user", JSON.stringify({
                username: data.user.username,
                email: data.user.email,
                token: data.token,
                role: data.user.role,
                managedRestaurant: data.user.managedRestaurant
            }));

            // Redirect based on role
            if (data.user.role === 'restaurant_owner' || data.user.role === 'admin') {
                window.location.href = "admin-dashboard.html";
            } else {
                const params = new URLSearchParams(window.location.search);
                const redirect = params.get("redirect");
                window.location.href = redirect ? decodeURIComponent(redirect) : "index.html";
            }
        } else {
            alert(data.error || "Login failed!");
        }
    } catch (error) {
        console.error("Login Error:", error);
        alert("An error occurred. Please try again.");
    }
});
