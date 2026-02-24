// footer.js
document.addEventListener('DOMContentLoaded', function() {
    fetch('footer.html')  // Load the footer.html file
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok ' + response.statusText);
        }
        return response.text();  // Get the response as text
      })
      .then(data => {
        document.body.insertAdjacentHTML('beforeend', data);  // Insert the footer at the end of the body
      })
      .catch(error => {
        console.error('There was a problem with the fetch operation:', error);
      });
});
