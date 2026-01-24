// Initialize Stripe with the publishable key
const stripe = Stripe('pk_live_51SsZQpRzhH83h3CBAHKRALXbBaeTzPfEwdyiAfB3fk8V3u2a10JerWYLOMSVxjIHAn5i7YYCmtPJnok6BBGdSgxn00jceDXFBu');

/**
 * Trigger Stripe Checkout
 * @param {string} priceId - The Stripe Price ID (e.g., price_12345)
 */
async function checkout(priceId) {
    if (!priceId) {
        console.error("Price ID is required for checkout.");
        return;
    }

    try {
        const { error } = await stripe.redirectToCheckout({
            lineItems: [{ price: priceId, quantity: 1 }],
            mode: 'payment',
            successUrl: window.location.origin + '/success.html',
            cancelUrl: window.location.origin + '/cancel.html',
        });

        if (error) {
            console.error("Stripe Checkout Error:", error);
            alert("Payment failed: " + error.message);
        }
    } catch (err) {
        console.error("Payment Error:", err);
        alert("An unexpected error occurred.");
    }
}

// Example usage:
// document.getElementById('checkout-button').addEventListener('click', () => {
//     checkout('price_H5ggYnDqa921');
// });
