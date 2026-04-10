document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = 'Message sent! Thanks for reaching out.';
    status.hidden = false;
    form.reset();
    setTimeout(() => { status.hidden = true; }, 4000);
  });
});
