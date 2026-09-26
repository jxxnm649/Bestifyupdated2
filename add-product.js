import { db } from "./firebase.js";

import {
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const form = document.getElementById("productForm");

form.addEventListener("submit", async (e) => {

  e.preventDefault();

  const productName = document.getElementById("productName").value.trim();
  const price = document.getElementById("price").value.trim();
  const description = document.getElementById("description").value.trim();
  const image = document.getElementById("image").value.trim();
  const category = document.getElementById("category").value.trim();

  console.log({
    productName,
    price,
    description,
    image,
    category
  });
  alert(
`Name: ${productName}
Price: ${price}
Description: ${description}
Image: ${image}
Category: ${category}`
);

  try {

    await setDoc(doc(db, "products", Date.now().toString()), {
      productName,
      price,
      description,
      image,
      category,
      createdAt: new Date()
    });

    alert("✅ Product Added Successfully");

    form.reset();

  } catch (error) {
    console.error(error);
    alert(error.message);
  }

});
