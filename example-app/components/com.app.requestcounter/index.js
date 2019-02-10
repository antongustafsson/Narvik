// using (requests)
function component(htmlElement, store) {
    const { requests } = store
    htmlElement.innerHTML = `Request count: ${requests}`
}

component