"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Narvik_1 = require("./Narvik");
const vm = require("vm");
const fs_1 = require("fs");
const path_1 = require("path");
const appDir = 'example-app';
const server = new Narvik_1.NarvikServer(appDir);
server.start();
const context = vm.createContext({
    Node: Narvik_1.Node,
    HTMLComponent: Narvik_1.HTMLComponent,
    StyledHTMLComponent: Narvik_1.StyledHTMLComponent,
    JavascriptComponent: Narvik_1.JavascriptComponent,
    StyledJavascriptComponent: Narvik_1.StyledJavascriptComponent,
    Store: Narvik_1.Store
});
server.setRequestHandler((req, res) => new Promise((resolve, reject) => {
    context.req = req;
    context.res = res;
    const script = new vm.Script(fs_1.readFileSync(path_1.resolve(appDir, 'main.js')).toString());
    script.runInContext(context);
    resolve(({ rootNode: context.rootNode, store: context.store }));
}));
