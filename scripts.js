// Update your scripts.js file with this code:
document.addEventListener("DOMContentLoaded", function () {
  const images = document.querySelectorAll(".hero-images img");
  let index = 0;

  // Setup initial state
  images.forEach((img, i) => {
    img.style.position = "absolute";
    img.style.transition = "opacity 1.5s ease-in-out";
    img.style.opacity = i === 0 ? "1" : "0";
  });

  function changeImage() {
    // Hide current image
    images[index].style.opacity = "0";
    
    // Move to next image
    index = (index + 1) % images.length;
    
    // Show next image
    images[index].style.opacity = "1";
  }

  // Start the slideshow
  setInterval(changeImage, 3000);
});