module.exports = {
    ErrorMessage: (error) => {
        return new Object({
            status: false,
            message: error,
        })
    },
    SuccessMessage: (item) => {
        return new Object({
            status: true,
            data: item
        })
    },

}