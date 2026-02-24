document.addEventListener("DOMContentLoaded", function () {
    // Fetch and load the navbar
    fetch('usernavbar.html')
        .then(response => response.text())
        .then(data => {
            document.body.insertAdjacentHTML('afterbegin', data);
            setupNavbar(); // ✅ Call function after navbar loads
        })
        .catch(error => console.error('Error loading navbar:', error));
});

// Function to setup the navbar profile
function setupNavbar() {
    const user = JSON.parse(localStorage.getItem("user"));

    if (user) {
        const profileSection = document.getElementById("profileSection");
        const profileName = document.getElementById("profileName");
        const profilePic = document.getElementById("profilePic");

        if (profileSection) {
            profileSection.style.display = "block";
        }
        if (profileName) {
            profileName.textContent = user.username || user.email || "User";
        }
        if (profilePic && user.profilePic) {
            profilePic.src = user.profilePic;
        }

        // Show Admin Panel link for authorized roles
        const adminLink = document.getElementById("adminLink");
        if (adminLink && (user.role === 'admin' || user.role === 'restaurant_owner')) {
            adminLink.style.display = "block";

            // Also update the "My Dashboard" link to point to admin dashboard for convenience
            const dashboardLink = document.querySelector('a[href="dashboard.html"]');
            if (dashboardLink) {
                dashboardLink.href = "admin-dashboard.html";
            }
        }
    }

    // Logout Functionality
    const logoutButton = document.getElementById("logout");
    if (logoutButton) {
        logoutButton.addEventListener("click", function () {
            localStorage.removeItem("user");
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            window.location.href = "login.html";
        });
    }
}
document.addEventListener("DOMContentLoaded", function () {
    const user = JSON.parse(localStorage.getItem("user"));

    if (user) {
        document.getElementById("profileSection").style.display = "block";
        document.getElementById("profileName").textContent = user.name;

        if (user.profilePic) {
            document.getElementById("profilePic").src = user.profilePic;
        }
    }

    // Logout functionality
    document.getElementById("logout").addEventListener("click", function () {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        window.location.href = "login.html";
    });
});
