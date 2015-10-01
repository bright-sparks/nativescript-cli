// A sample Mocha test

//TODO: replace with a better assertion module
var assert = {
	equal: function (a, b) {
		if (a !== b) {
			throw Error('assertion failed');
		}
	}
}

describe('Array', function () {
	describe('#indexOf()', function () {
		it('should return -1 when the value is not present', function () {
			assert.equal(-1, [1,2,3].indexOf(5));
			assert.equal(-1, [1,2,3].indexOf(0));
		});
	});
});
