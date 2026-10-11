let loader = null;

/** Load Razorpay Checkout.js on demand (only needed when live test keys are configured). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(true);
  if (!loader) {
    loader = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => {
        loader = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }
  return loader;
}
