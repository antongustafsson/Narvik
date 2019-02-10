(() => {
    "define store";
    window.components = {};

    "define components";

    Object.keys(window.components).forEach(name => {
        const elements = Array.prototype.slice.call(document.getElementsByClassName(`instance--${name}`))
        elements.forEach(element => {
            window.components[name](element, store)
        })
    })
})()