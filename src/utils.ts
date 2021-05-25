
export const loadSagaTasks = (modules: any) => {
    return Object.keys(modules).reduce((taskArray: any[], moduleName) => {
        const module = (modules as any)[moduleName]
        if (module && module.sagaTasks && Array.isArray(module.sagaTasks)) {
            taskArray = [...taskArray, ...module.sagaTasks]
        }
        return taskArray
    }, [])
}

export const loadReducers = (modules: any, initialState = {}) => {
    return Object.keys(modules)
        .reduce((reducerObjs, moduleName) => {
            const module = (modules as any)[moduleName]
            if (module && module.reducerObj && typeof module.reducerObj === 'object') {
                reducerObjs = { ...reducerObjs, ...module.reducerObj }
            }
            return reducerObjs
        }, initialState)
}
