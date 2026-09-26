import { auth, db } from "./firebase.js";

import { createUserWithEmailAndPassword }
from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import { doc, setDoc }
from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { raiseAdminAlert } from "./admin-alerts.js";

const form = document.getElementById("registerForm");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        await setDoc(doc(db, "users", userCredential.user.uid), {
            name: name,
            email: email,
            isAdmin: false,
            createdAt: new Date()
        });

        raiseAdminAlert("signup", `New user signed up: ${name}`, {
            userId: userCredential.user.uid,
            userName: name
        });

        alert("Registration Successful!");

        window.location.href = "home.html";

    } catch (error) {
        alert(error.message);
    }
});
