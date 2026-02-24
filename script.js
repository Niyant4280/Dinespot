const blogPosts = [
  {
  title: "Top 10 Restaurants for Date Nights",
      excerpt: "Looking for a perfect spot for your next date? We've compiled a list of top romantic restaurants to help you create unforgettable memories...",
      fullText: "Planning a date night can be a daunting task, but the right restaurant can set the mood perfectly. Whether you prefer an intimate atmosphere or a lively ambiance, we've got you covered. Explore our top 10 picks that promise not just delicious food but also a memorable experience.",
      image: "blog2.jpg"
    },
    {
      title: "How to Choose a Restaurant for Special Occasions",
      excerpt: "Special occasions deserve special places. Find out how to choose the perfect restaurant for your celebrations with our expert tips...",
      fullText: "Choosing a restaurant for a special occasion requires careful consideration. Think about the ambiance, menu, and location. Ensure the restaurant can accommodate your group size and dietary restrictions. It's also a good idea to inquire about any special arrangements or decorations they can provide to make your celebration memorable.",
      image: "blog3.jpg"
    },
    {
      title: "A Guide to the Best International Cuisines",
      excerpt: "Expand your palate with our guide to the best international cuisines. Discover the flavors of different cultures and what makes them unique...",
      fullText: "Traveling through food is one of the best ways to experience other cultures. From the spicy dishes of Thailand to the comforting flavors of Italian pasta, each cuisine tells a story. This guide explores various international cuisines, highlighting must-try dishes that capture the essence of each culture.",
      image: "blog4.jpg"
    },
    {
      title: "How to Dine Solo: Tips for Enjoying Your Own Company",
      excerpt: "Dining solo can be an enriching experience. Here are some tips on how to make the most of your solo dining adventures...",
      fullText: "Eating alone doesn't have to be a lonely experience. In fact, it can be liberating. Find a cozy restaurant or a café with a nice ambiance, bring a book, or simply enjoy people-watching. Choose dishes you truly love, and don't hesitate to strike up a conversation with the staff or fellow diners.",
      image: "blog5.jpg"
    },
    {
      title: "The Importance of Supporting Local Restaurants",
      excerpt: "Discover why supporting local restaurants is essential for your community and how you can contribute to their success...",
      fullText: "Local restaurants play a crucial role in the community by providing jobs, supporting local farmers, and contributing to the local economy. By dining at local eateries, you help keep your neighborhood vibrant. Explore ways to support your favorite local spots, from dining in to ordering takeout.",
      image: "blog6.jpg"
    },
    {
      title: "Exploring Vegan and Vegetarian Dining Options",
      excerpt: "Vegan and vegetarian dining has evolved tremendously. Here’s how to find the best options in your area...",
      fullText: "The rise of plant-based eating has led to an explosion of options for vegans and vegetarians. From specialized restaurants to diverse menus in traditional eateries, finding delicious plant-based meals is easier than ever. Learn what to look for and where to find the best vegan and vegetarian restaurants near you.",
      image: "blog7.jpg"
    },
    {
      title: "Dining Etiquette: What You Need to Know",
      excerpt: "Mastering dining etiquette can enhance your dining experiences. Here are essential tips to keep in mind during your next outing...",
      fullText: "Understanding dining etiquette is crucial, especially in formal settings. From using the correct cutlery to knowing when to place your napkin on your lap, these small details can make a big difference. This blog post covers essential dining etiquette tips that will help you feel confident and composed during any meal.",
      image: "blog8.jpg"
    },
    {
      title: "The Rise of Food Delivery Services",
      excerpt: "Food delivery services have transformed how we dine. Discover their impact on the restaurant industry and dining habits...",
      fullText: "In recent years, food delivery services have become increasingly popular, changing how we experience dining. This post explores the benefits and challenges of food delivery services for both restaurants and consumers, shedding light on how they have shaped our eating habits.",
      image: "blog9.jpg"
    },
    {
      title: "Food Pairing: How to Choose the Right Drink",
      excerpt: "Enhance your dining experience by mastering the art of food and drink pairing. Here are some tips to get you started...",
      fullText: "Choosing the right drink can elevate a meal to new heights. This guide offers insights into pairing food with wine, beer, and cocktails, ensuring that every meal is perfectly complemented. Whether you're hosting a dinner party or enjoying a night out, knowing how to pair drinks can impress your guests.",
      image: "blog10.jpg"
    }
];

// Function to load blog posts
function loadPosts() {
  const blogContainer = document.getElementById('blogContainer');
  const loading = document.getElementById('loading');
  loading.style.display = 'block';

  setTimeout(() => {
    loading.style.display = 'none';
    blogPosts.forEach((post, index) => {
      const postElement = document.createElement('article');
      postElement.className = 'blog-post';
      postElement.innerHTML = `
        <img src="${post.image}" alt="${post.title}" class="blog-image">
        <div class="blog-content">
          <h2 class="blog-title">${post.title}</h2>
          <p class="blog-excerpt">${post.excerpt}</p>
          <button class="read-more" onclick="showFullPost(${index})">Read More</button>
        </div>
      `;
      blogContainer.appendChild(postElement);
    });
  }, 1000);
}

// Function to show full post details in a modal
function showFullPost(index) {
  const post = blogPosts[index];
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modalContent');

  modalContent.innerHTML = `
    <span class="close" onclick="closeModal()">&times;</span>
    <img src="${post.image}" alt="${post.title}" class="modal-image">
    <h2 class="modal-title">${post.title}</h2>
    <p class="modal-text">${post.fullText}</p>
  `;
  modal.style.display = 'flex';
}

// Function to close the modal
function closeModal() {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';
}

// Load posts when the page loads
window.onload = loadPosts;
