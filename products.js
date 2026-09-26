import { auth, db } from "./firebase.js";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const productsDiv = document.getElementById("products");
const searchInput = document.getElementById("search");

let allProducts = [];

// Load Products
async function loadProducts() {

  try {

    const querySnapshot = await getDocs(collection(db, "products"));

    allProducts = [];

    querySnapshot.forEach((docSnap) => {

      allProducts.push({
        id: docSnap.id,
        ...docSnap.data()
      });

    });

    displayProducts(allProducts);

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

}

// Display Products
function displayProducts(products) {

  productsDiv.innerHTML = "";

  if (products.length === 0) {
    productsDiv.innerHTML = "<h2>No Products Found 😔</h2>";
    return;
  }

  products.forEach((product) => {

    const hasStock = typeof product.stock === "number";
    const outOfStock = hasStock && product.stock === 0;
    const lowStock = hasStock && product.stock > 0 && product.stock <= 5;

    productsDiv.innerHTML += `
      <div class="card" onclick="openProduct('${product.id}')">

        <img src="${product.image}" alt="${product.productName}">

        <div class="card-content">

          <h2>${product.productName}</h2>

          <p>${product.category}</p>

          <p class="price">₹${product.price}</p>

          ${hasStock ? `<span class="stock-badge ${outOfStock ? "out" : lowStock ? "low" : "in"}">
            ${outOfStock ? "Out of Stock" : lowStock ? `Only ${product.stock} left` : "In Stock"}
          </span>` : ""}

          <p>${product.description}</p>

<button onclick="event.stopPropagation(); toggleWishlist('${product.id}')">
❤️ Wishlist
</button>

<br><br>


<button onclick="event.stopPropagation(); addToCart('${product.id}')" ${outOfStock ? "disabled" : ""}>
  ${outOfStock ? "Out of Stock" : "Add To Cart"}
</button>

        </div>

      </div>
    `;

  });

}

// Search
searchInput.addEventListener("keyup", () => {

  const keyword = searchInput.value.trim().toLowerCase();

  const filteredProducts = allProducts.filter(product => {

    const name = (product.productName || "").toLowerCase();
    const category = (product.category || "").toLowerCase();
    const description = (product.description || "").toLowerCase();

    return (
      name.includes(keyword) ||
      category.includes(keyword) ||
      description.includes(keyword)
    );

  });

  displayProducts(filteredProducts);

});

// Add To Cart
window.addToCart = async function(id) {

  try {

    const user = auth.currentUser;

    if (!user) {
      alert("Please Login First");
      return;
    }

    const productRef = doc(db, "products", id);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      alert("Product Not Found");
      return;
    }

    const cartRef = doc(db, "users", user.uid, "cart", id);
    const cartSnap = await getDoc(cartRef);
    const qty = cartSnap.exists() ? (cartSnap.data().qty || 1) + 1 : 1;

    await setDoc(cartRef, { ...productSnap.data(), qty });

    alert("Added To Cart ✅");

  } catch (error) {

    alert(error.message);
    console.log(error);

  }

};
window.openProduct = function(id) {
  window.location.href = "product.html?id=" + id;
};

// Start
loadProducts();

window.toggleWishlist = async function(id) {

  const user = auth.currentUser;

  if (!user) {
    alert("Please Login First");
    window.location.href = "login.html";
    return;
  }

  const wishlistRef = doc(db, "users", user.uid, "wishlist", id);

  const wishlistSnap = await getDoc(wishlistRef);

  if (wishlistSnap.exists()) {

    await deleteDoc(wishlistRef);
    alert("Removed from Wishlist ❤️");

  } else {

    const productSnap = await getDoc(doc(db, "products", id));

    await setDoc(
      wishlistRef,
      productSnap.data()
    );

    alert("Added to Wishlist ❤️");
  }

};
