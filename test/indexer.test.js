"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const indexer_1 = require("../src/indexer");
describe('Tcl indexer parsing', () => {
    it('parses a proc with two params', () => {
        const line = 'proc abc {var1 var2} { puts $var1 }';
        const res = (0, indexer_1.parseDefinitionLine)(line);
        (0, chai_1.expect)(res).to.not.be.null;
        (0, chai_1.expect)(res.type).to.equal('proc');
        (0, chai_1.expect)(res.name).to.equal('abc');
        (0, chai_1.expect)(res.params).to.deep.equal(['var1', 'var2']);
    });
    it('parses a method with single param', () => {
        const line = '  method doThing {x} { # body }';
        const res = (0, indexer_1.parseDefinitionLine)(line);
        (0, chai_1.expect)(res).to.not.be.null;
        (0, chai_1.expect)(res.type).to.equal('method');
        (0, chai_1.expect)(res.name).to.equal('doThing');
        (0, chai_1.expect)(res.params).to.deep.equal(['x']);
    });
    it('returns null for non-definition lines', () => {
        const line = 'set a 1';
        const res = (0, indexer_1.parseDefinitionLine)(line);
        (0, chai_1.expect)(res).to.be.null;
    });
});
//# sourceMappingURL=indexer.test.js.map