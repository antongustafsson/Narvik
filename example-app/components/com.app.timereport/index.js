function component(htmlElement, store) {
    htmlElement.innerHTML = `<div class="time">Page loaded on ${store.time}</div>`
}

component