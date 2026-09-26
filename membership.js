// ==========================================
// BESTIFY MEMBERSHIP
// Razorpay Subscription Link
// ==========================================


// Your Razorpay Subscription Link
const RAZORPAY_SUBSCRIPTION_LINK =
  "https://rzp.io/rzp/TlmPHejv";


// Subscribe Button
const subscribeBtn =
  document.getElementById("subscribeBtn");


// Check button exists
if (subscribeBtn) {

  subscribeBtn.addEventListener("click", () => {

    // Change button text
    subscribeBtn.innerText = "Opening Secure Payment...";

    subscribeBtn.disabled = true;


    // Open Razorpay Subscription Link
    window.location.href =
      RAZORPAY_SUBSCRIPTION_LINK;

  });

}
