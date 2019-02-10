"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const path_1 = require("path");
const fs_1 = require("fs");
const uuid_1 = require("uuid");
const mime = require("mime");
let componentsDirectory = path_1.resolve(__dirname, 'components');
const htmlFileFilename = 'index.html';
const componentEntrypointFilename = 'index.js';
const componentStylesheetFilename = 'styles.css';
const templateRegexp = /<\s*([\w\.]*?)\s*\/>/g;
const extractStoreUsage = (code) => {
    const result = /\/\/\s*using\s*\(([\w\d\s,]+)\)/g.exec(code);
    if (result) {
        return result[1].split(',').map(untrimmed => untrimmed.trim());
    }
    return [];
};
const getAllMatches = (regexp, subject) => {
    const matches = [];
    let match;
    do {
        match = regexp.exec(subject);
        if (match) {
            matches.push(match[1]);
        }
    } while (match);
    return matches;
};
const replaceAll = (regexp, subject, replacer) => {
    let match;
    do {
        match = regexp.exec(subject);
        if (match) {
            subject = subject.replace(match[0], replacer(match[1]));
        }
    } while (match);
    return subject;
};
class ContentServer {
    constructor() {
        this.data = {};
    }
    generateName(type) {
        return `${uuid_1.v4()}.${type}`;
    }
    store(bundle, type) {
        const key = this.generateName(type);
        this.data[key] = bundle;
        setTimeout(() => {
            delete this.data[key];
        }, 5000);
        return key;
    }
    serve(key) {
        const copy = this.data[key] && this.data[key].toString();
        delete this.data[key];
        return copy;
    }
}
class NarvikServer {
    constructor(appPath) {
        this.contentServer = new ContentServer();
        this.appPath = appPath;
        componentsDirectory = path_1.resolve(this.appPath, 'components');
        this.app = express();
        this.app.use((req, res) => {
            if (req.path === '/') {
                if (this.requestHandler) {
                    this.requestHandler(req, res).then(context => {
                        console.log('Render:', (context.rootNode.presentable || context.rootNode).toString());
                        const result = this.compile(context.rootNode, context.store);
                        res.send(result);
                    });
                }
                else {
                    res.status(404);
                    res.send('Not found');
                }
            }
            else {
                const filename = req.path.substring(1);
                const content = this.contentServer.serve(filename);
                if (content) {
                    res.set('Content-Type', mime.getType(filename.split('.')[1]));
                    res.send(content);
                }
                else {
                    res.status(404);
                    res.send('Not found');
                }
            }
        });
    }
    setRequestHandler(handler) {
        this.requestHandler = handler;
    }
    start() {
        this.app.listen(8080);
    }
    compile(node, store) {
        const renderResult = node.render();
        const componentNames = Object.keys(renderResult.javascript);
        const storeObject = {};
        node.usage.forEach(key => {
            storeObject[key] = store.getValue(key);
        });
        let javascriptBundle = null;
        if (componentNames.length > 0) {
            const componentsDefenition = componentNames.map(name => {
                return `window.components["${name}"] = eval(atob("${Buffer.from(renderResult.javascript[name]).toString('base64')}"))`;
            }).join(';\n');
            const storeDefinition = `const store = ${JSON.stringify(storeObject)}`;
            javascriptBundle = fs_1.readFileSync('bundlefile.js')
                .toString()
                .replace(`"define components";`, componentsDefenition)
                .replace(`"define store";`, storeDefinition);
        }
        return replaceAll(/#\[place ([\sa-z]+)\]/g, renderResult.html, name => {
            if (name === 'scripts' && componentNames.length > 0) {
                return `<script src="/${this.contentServer.store(javascriptBundle, 'js')}"></script>`;
            }
            else if (name === 'styles' && renderResult.css.length > 0) {
                return `<link rel="stylesheet" type="text/css" href="/${this.contentServer.store(renderResult.css, 'css')}"`;
            }
            return '';
        });
    }
}
exports.NarvikServer = NarvikServer;
class Store {
    constructor() {
        this.state = {};
    }
    getValue(key) {
        return this.state[key];
    }
    set(value) {
        this.state = value;
    }
    setValue(key, value) {
        this.state[key] = value;
    }
}
exports.Store = Store;
const loadResource = (bundleIdentifier, resourceName) => {
    const bundlePath = path_1.resolve(componentsDirectory, bundleIdentifier);
    const expectedContentFilepath = path_1.resolve(bundlePath, resourceName);
    console.log('Load resource', expectedContentFilepath);
    if (fs_1.existsSync(expectedContentFilepath)) {
        return {
            bundlePath,
            content: fs_1.readFileSync(expectedContentFilepath).toString()
        };
    }
    return null;
};
class CSSComponent {
}
exports.CSSComponent = CSSComponent;
class HTMLComponent {
    constructor(bundleIdentifier) {
        this.name = bundleIdentifier;
        const result = loadResource(this.name, htmlFileFilename);
        if (result) {
            this.htmlContent = result.content;
            this.bundlePath = result.bundlePath;
        }
    }
}
exports.HTMLComponent = HTMLComponent;
class StyledHTMLComponent extends HTMLComponent {
    constructor(bundleIdentifier) {
        super(bundleIdentifier);
        const result = loadResource(bundleIdentifier, componentStylesheetFilename);
        if (result) {
            this.bundlePath = result.bundlePath;
            this.stylesheet = result.content;
        }
    }
}
exports.StyledHTMLComponent = StyledHTMLComponent;
class JavascriptComponent {
    constructor(bundleIdentifier) {
        this.name = bundleIdentifier;
        const result = loadResource(bundleIdentifier, componentEntrypointFilename);
        if (result) {
            this.bundlePath = result.bundlePath;
            this.code = result.content;
        }
        else
            throw new Error(`Component entrypoint not found: ${bundleIdentifier}`);
        this.usage = extractStoreUsage(this.code);
    }
}
exports.JavascriptComponent = JavascriptComponent;
class StyledJavascriptComponent extends JavascriptComponent {
    constructor(bundleIdentifier) {
        super(bundleIdentifier);
        const result = loadResource(bundleIdentifier, componentStylesheetFilename);
        if (result) {
            this.bundlePath = result.bundlePath;
            this.stylesheet = result.content;
        }
    }
}
exports.StyledJavascriptComponent = StyledJavascriptComponent;
class Node {
    constructor(name, usage, component, template) {
        this.childNodes = [];
        this.usage = [];
        this.name = name;
        this.childNodes = [];
        this.usage = usage;
        this.template = template;
        if (component) {
            this.component = component;
            this.usage = component.usage;
        }
    }
    addChild(node) {
        node.parentNode = this;
        this.childNodes.push(node);
    }
    hasParent() {
        return Boolean(this.parentNode);
    }
    getChildNodeByName(name) {
        const filterResult = this.childNodes.filter(node => node.name === name);
        if (filterResult.length > 0) {
            return filterResult[0];
        }
        return null;
    }
    render() {
        let renderResult = {
            html: '',
            css: '',
            javascript: {},
            renderedComponents: []
        };
        if (this.presentable) {
            return this.presentable.render();
        }
        else {
            if (this.component instanceof JavascriptComponent) {
                renderResult.javascript[this.name] = this.component.code;
                renderResult.html = `<div class="instance--${this.name}"></div>`;
            }
            if (this.component instanceof StyledJavascriptComponent) {
                renderResult.css = this.component.stylesheet;
            }
            if (this.component instanceof HTMLComponent) {
                this.template = this.component.htmlContent;
            }
            if (this.component instanceof StyledHTMLComponent) {
                renderResult.css = this.component.stylesheet;
            }
            if (this.template) {
                renderResult.html = replaceAll(templateRegexp, this.template, match => {
                    if (match === this.name)
                        throw new Error('Node cannot render itself');
                    const childNode = this.getChildNodeByName(match);
                    if (childNode) {
                        const childRenderResult = childNode.render();
                        if (renderResult.renderedComponents.indexOf(childNode.name) < 0) {
                            renderResult.javascript = Object.assign({}, renderResult.javascript, childRenderResult.javascript);
                            renderResult.css += `\n${childRenderResult.css}`;
                        }
                        renderResult.renderedComponents.push(childNode.name);
                        return childRenderResult.html;
                    }
                    return '';
                    // throw new Error(`Node "${match}" does not exist`)
                });
            }
        }
        return renderResult;
    }
    present(node) {
        this.presentable = node;
    }
    toString() {
        let buffer = '';
        buffer += `Node(${this.name})`;
        if (this.usage && this.usage.length > 0) {
            buffer += ': ' + this.usage.join(', ');
        }
        if (this.childNodes.length > 0) {
            buffer += `{\n`;
            for (let i = 0; i < this.childNodes.length; i++) {
                const node = this.childNodes[i];
                buffer += `  ${node.toString()}\n`;
            }
            buffer += `}`;
        }
        return buffer;
    }
    static fromComponent(component, usage) {
        if (component && component.name) {
            return new Node(component.name, usage || component.usage, component);
        }
        else
            throw new Error(`Value ${component} is not a valid component`);
    }
    static fromTemplate(name, template, usage = []) {
        return new Node(name, usage, undefined, template);
    }
}
exports.Node = Node;
