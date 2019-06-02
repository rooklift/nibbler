"use strict";

String.prototype.replaceAll = function(search, replace) {
    if (typeof replace !== "string") {
        return this.toString();
    }
    return this.split(search).join(replace);
}
