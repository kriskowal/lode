
exports.Brand = Brand;
function Brand() {
    var flag = false;
    var payload = null;
    
    return {
        seal: function (payloadToSeal) {
            function box () {
                flag = true;
                payload = payloadToSeal;
            }
            box.toString = function(){return "(box)";}
            return box;
        },
        unseal: function (box) {
            flag = false;
            payload = null;
            try{
                box();
                if (!flag){ throw 'Invalid Box'}
                return payload;
            }finally{
                flag = false;
                payload = null;
            }
        }
    };

}

