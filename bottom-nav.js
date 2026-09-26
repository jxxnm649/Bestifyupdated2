/* ============================================================
   Shared bottom navigation — active tab highlighting.
   Used on: home.html, wishlist.html, orders.html, profile.html
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  const currentPath = window.location.pathname.toLowerCase();

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");
  });

  if (currentPath.includes("wishlist.html")) {
    const liked = document.getElementById("nav-liked");
    liked.classList.add("active");
    liked.querySelector("i").className = "fa-solid fa-thumbs-up";
  } else if (currentPath.includes("orders.html")) {
    document.getElementById("nav-orders").classList.add("active");
  } else if (currentPath.includes("profile.html")) {
    const account = document.getElementById("nav-account");
    account.classList.add("active");
    account.querySelector("i").className = "fa-solid fa-file-lines";
  } else {
    document.getElementById("nav-home").classList.add("active");
  }
});
