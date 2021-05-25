import { createAction, PayloadActionCreator, ActionCreatorWithPreparedPayload, createSelector } from '@reduxjs/toolkit'
import * as redux from 'react-redux'
import { ForkEffect, takeLeading } from 'redux-saga/effects'
import * as R from 'ramda'

import { buildPathWithName, createGlobalAction, createGlobalSelector, GlobalActionType, GlobalSelector } from './global-task'

export type Parameters<T> = T extends (...args: infer P) => any ? P : never
export type ReturnType<T> = T extends (...args: any) => infer V ? V : any

export interface AsyncType {
    REQUEST: string,
    INITIAL: string,
    SUCCESS: string,
    FAILURE: string,
}

export const createAsyncType = (taskName: string, moduleName: string): AsyncType => ({
    INITIAL: `${moduleName}/${taskName}/initial`,
    REQUEST: `${moduleName}/${taskName}/request`,
    SUCCESS: `${moduleName}/${taskName}/fulfilled`,
    FAILURE: `${moduleName}/${taskName}/rejected`,
})

export interface ReduxAsyncTask<NAME extends string, PAYLOAD, DATA, SELECTOR> {
    actionMaps: { [type: string]: (state: any, action: any) => void }
    actions: ReduxAsyncTaskActionType<PAYLOAD, DATA>
    initialState: Record<NAME, AsyncState<DATA>>
    moduleName: string
    name: NAME
    types: AsyncType

    fromRootSelectors: SELECTOR & ReduxAsyncSelector<NAME, DATA, any>

    sagaFunction: (action: ReturnType<ActionCreatorWithPreparedPayload<[payload: PAYLOAD, meta?: any], PAYLOAD, string, never, any>>) => Generator<any, any, any>
    sagaEffect: ForkEffect

    useSelector: () => { [P in keyof SELECTOR]: Parameters<SELECTOR[P]> }
    useState: () => AsyncTaskState<DATA>
    useAction: <S = any>() => {
        onInit: () => void;
        onRequest: (payload: PAYLOAD, meta?: any) => void;
        onSetValue: (path: (keyof S | string), value: any) => void,
        onClearValue: (path: (keyof S | string)) => void,
        onMergeValue: (value: Partial<S>) => void
    }
    useTask: <S = any>() => AsyncTaskState<DATA> & {
        onInit: () => void;
        onRequest: (payload: PAYLOAD, meta?: any) => void;
        onSetValue: (path: (keyof S | string), value: any) => void,
        onClearValue: (path: (keyof S | string)) => void,
        onMergeValue: (value: Partial<S>) => void
    }
}

export interface ReduxAsyncTaskOption<
    NAME extends string = any,
    STATE = any,
    PAYLOAD = void,
    DATA = void,
    SELECTOR = { [name: string]: (...args: any) => (taskState: AsyncTaskState<DATA>, moduleState?: STATE & Record<NAME, AsyncTaskState<DATA>>) => any }
    > {
    initialState?: STATE
    initialTaskState?: AsyncTaskState<DATA>
    defaultData?: DATA
    defaultPayload?: PAYLOAD
    moduleName: string
    name: NAME
    saga: SagaFunction<NAME, PAYLOAD, DATA>
    sagaActor?: SagaActorType
    slim?: boolean
    extraActionMaps?: {
        [type: string]: (state: any, action: any) => void
    }
    extraSelector?: SELECTOR
}

export function createReduxAsyncTask<
    NAME extends string = any,
    STATE = any,
    PAYLOAD = void,
    DATA = void,
    SELECTOR = { [name: string]: (...args: any) => (taskState: AsyncTaskState<DATA>, moduleState?: STATE & Record<NAME, AsyncTaskState<DATA>>) => any }
>(options: ReduxAsyncTaskOption<NAME, STATE, PAYLOAD, DATA, SELECTOR>) {
    const {
        name,
        moduleName,
        saga,
        sagaActor = takeLeading,
        slim,
        initialState = {} as any,
        extraActionMaps = {},
        extraSelector = {} as any,
    } = options
    const types = createAsyncType(name, moduleName)
    const globalActions = createGlobalAction(moduleName)
    const actions: ReduxAsyncTaskActionType<PAYLOAD, DATA> = {
        ...globalActions,
        initial: createAction(types.INITIAL),
        request: createAction(types.REQUEST, (payload: PAYLOAD, meta?: any) => ({ payload, meta })),
        success: createAction(types.SUCCESS, (payload: DATA, meta?: any) => ({ payload, meta })),
        failure: createAction(types.FAILURE, (error: any, message?: string, meta?: any) => ({ payload: message, error, meta })),
    }

    let actionMaps = extraActionMaps
    if (!slim) {
        actionMaps = {
            ...actionMaps,
            [types.INITIAL]: (state: Record<NAME, AsyncTaskState<DATA>>, action: ReturnType<typeof actions.initial>) => {
                state[name] = initialState[name]
            },
            [types.REQUEST]: (state: Record<NAME, AsyncTaskState<DATA>>, action: ReturnType<typeof actions.request>) => {
                const prefix = R.path<string>(['meta', 'prefix'], action)
                if (prefix) {
                    if (!state[name].prefixs) {
                        state[name].prefixs = {}
                    }
                    if (!state[name].prefixs![prefix]) {
                        state[name].prefixs![prefix] = {}
                    }
                    state[name].prefixs![prefix].loading = true
                    state[name].prefixs![prefix].data = undefined
                    state[name].prefixs![prefix].error = undefined
                    state[name].prefixs![prefix].message = undefined
                } else {
                    state[name].loading = true
                    state[name].data = undefined
                    state[name].error = undefined
                    state[name].message = undefined
                }
            },
            [types.SUCCESS]: (state: Record<NAME, AsyncTaskState<DATA>>, action: ReturnType<typeof actions.success>) => {
                const prefix = R.path<string>(['meta', 'prefix'], action)
                if (prefix) {
                    if (!state[name].prefixs) {
                        state[name].prefixs = {}
                    }
                    if (!state[name].prefixs![prefix]) {
                        state[name].prefixs![prefix] = {}
                    }
                    state[name].prefixs![prefix].initial = true
                    state[name].prefixs![prefix].loading = false
                    state[name].prefixs![prefix].data = action.payload
                } else {
                    state[name].initial = true
                    state[name].loading = false
                    state[name].data = action.payload
                }
            },
            [types.FAILURE]: (state: Record<NAME, AsyncTaskState<DATA>>, action: ReturnType<typeof actions.failure>) => {
                const prefix = R.path<string>(['meta', 'prefix'], action)
                if (prefix) {
                    if (!state[name].prefixs) {
                        state[name].prefixs = {}
                    }
                    if (!state[name].prefixs![prefix]) {
                        state[name].prefixs![prefix] = {}
                    }
                    state[name].prefixs![prefix].loading = false
                    state[name].prefixs![prefix].error = action.error
                    state[name].prefixs![prefix].message = action.payload
                } else {
                    state[name].loading = false
                    state[name].error = action.error
                    state[name].message = action.payload
                }
            },
        }
    }

    const fromModuleSelectors = createAsyncSelectors<NAME, DATA, Record<NAME, AsyncTaskState<DATA>>>(name)
    const fromRootSelectors = createAsyncSelectors<NAME, DATA, any>(name, moduleName)
    const moduleStateSelector = (rootState: any): any => rootState[moduleName]
    const taskStateSelector = (rootState: any): AsyncState<DATA> => rootState[moduleName][name]

    const wrapperSelector = (selector: any) => {
        return Object
            .keys(selector)
            .reduce((newSelector, selectorName) => {
                newSelector[selectorName] = (...args: any) => (rootState: any) => {
                    const moduleState = moduleStateSelector(rootState)
                    const taskState = taskStateSelector(rootState)
                    return selector[selectorName](args)(...[taskState, moduleState])
                }
                return newSelector
            }, {} as any)
    }

    const sagaFunction = saga({ actions, fromRootSelectors, moduleName, name })
    const sagaEffect = sagaActor(types.REQUEST, sagaFunction)

    return {
        moduleName,
        name,
        initialState: {
            ...initialState,
            [name]: {
                ...initialState[name],
            },
        } as STATE & Record<NAME, AsyncState<DATA>>,
        types,
        actions,
        actionMaps,
        sagaFunction,
        sagaEffect,
        fromRootSelectors: {
            ...fromRootSelectors,
            ...wrapperSelector(extraSelector),
        } as SELECTOR & ReduxAsyncSelector<NAME, DATA, any>,
        useSelector: <ST extends SELECTOR & ReduxAsyncSelector<NAME, DATA, any>>(): { [P in keyof ST]: (...args: Parameters<ST[P]>) => ReturnType<ReturnType<ST[P]>> } => {
            const moduleState = redux.useSelector(moduleStateSelector)
            const taskState = redux.useSelector(taskStateSelector)
            const globalSelectorObj = Object
                .keys(fromModuleSelectors)
                .reduce((newSelector, selectorName) => {
                    newSelector[selectorName] = (...args: any[]) => {
                        return extraSelector[selectorName](...args)(...[taskState, moduleState])
                    }
                    return newSelector
                }, {} as any)
            return Object
                .keys(extraSelector)
                .reduce((newSelector, selectorName) => {
                    newSelector[selectorName] = (...args: any[]) => {
                        return extraSelector[selectorName](...args)(...[taskState, moduleState])
                    }
                    return newSelector
                }, globalSelectorObj)
        },
        useState: <T extends AsyncState<DATA>, K extends keyof T>(...names: K[]): K[] extends undefined ? T : Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
            const taskState = redux.useSelector(taskStateSelector)
            if (names && names.length > 0) {
                return R.pick(names, taskState) as any
            }
            return taskState as any
        },
        useAction: <S = any>() => {
            const dispatch = redux.useDispatch()
            const handleInit = () => {
                dispatch(actions.initial())
            }
            const handleRequest = (payload: PAYLOAD, meta?: any) => {
                dispatch(actions.request(payload, meta))
            }
            const handleSetValue = (path: (keyof S | string), value: any) => {
                dispatch(actions.setValue({ path, value }))
            }
            const handleClearValue = (path: (keyof S | string)) => {
                dispatch(actions.clearValue({ path }))
            }
            const handleMergeValue = (value: Partial<S>) => {
                dispatch(actions.mergeValue(value))
            }
            return {
                onInit: handleInit,
                onRequest: handleRequest,
                onSetValue: handleSetValue,
                onClearValue: handleClearValue,
                onMergeValue: handleMergeValue,
            }
        },
        useTask: <S = any>() => {
            const taskState = redux.useSelector(taskStateSelector)
            const dispatch = redux.useDispatch()
            const handleInit = () => {
                dispatch(actions.initial())
            }
            const handleRequest = (payload: PAYLOAD) => {
                dispatch(actions.request(payload))
            }
            const handleSetValue = (path: (keyof S | string), value: any) => {
                dispatch(actions.setValue({ path, value }))
            }
            const handleClearValue = (path: (keyof S | string)) => {
                dispatch(actions.clearValue({ path }))
            }
            const handleMergeValue = (value: Partial<S>) => {
                dispatch(actions.mergeValue(value))
            }
            return {
                ...taskState,
                path: <T = any>(path: string | string[]): T | undefined => {
                    if (Array.isArray(path)) {
                        return R.path(path, taskState)
                    } else {
                        return R.path(R.split('.', path), taskState)
                    }
                },
                pathOr: <T = any>(path: string | string[], defaultValue: T): T => {
                    if (Array.isArray(path)) {
                        return R.pathOr(defaultValue)(path, taskState)
                    } else {
                        return R.pathOr(defaultValue)(R.split('.', path), taskState)
                    }
                },
                onInit: handleInit,
                onRequest: handleRequest,
                onSetValue: handleSetValue,
                onClearValue: handleClearValue,
                onMergeValue: handleMergeValue,
            }
        },
    }
}

export interface AsyncState<DATA = void> {
    loading?: boolean,
    data?: DATA,
    error?: any
    message?: string
    initial?: boolean,
}

export interface AsyncTaskState<DATA = void> extends AsyncState<DATA> {
    prefixs?: {
        [name: string]: AsyncState<DATA>
    }
}

export type SagaActorType = typeof takeLeading

export interface ReduxAsyncTaskActionType<PAYLOAD = void, DATA = void> extends GlobalActionType {
    initial: PayloadActionCreator<void, string>
    request: ActionCreatorWithPreparedPayload<[payload: PAYLOAD, meta?: any], PAYLOAD, string, never, any>
    success: ActionCreatorWithPreparedPayload<[payload: DATA, meta?: any], DATA, string, never, any>
    failure: ActionCreatorWithPreparedPayload<[error: any, message?: string, meta?: any], string | undefined, string, any, never>
}

export type SagaFunction<NAME extends string, PAYLOAD = void, DATA = void> =
    (parameter: {
        moduleName: string,
        name: string,
        actions: ReduxAsyncTaskActionType<PAYLOAD, DATA>
        fromRootSelectors: ReduxAsyncSelector<NAME, DATA, any>
    }) => (action: ReturnType<ActionCreatorWithPreparedPayload<[payload: PAYLOAD, meta?: any], PAYLOAD, string, never, any>>) => Generator<any, any, any>

export interface ReduxAsyncSelector<NAME extends string, DATA = void, STATE = Record<NAME, AsyncState<DATA>>> extends GlobalSelector<STATE> {
    taskState: () => (state: STATE) => AsyncTaskState<DATA>,
    data: () => (state: STATE) => (DATA | undefined),
    dataOr: (defaultValue: STATE) => (state: STATE) => DATA,
    loading: () => (state: STATE) => boolean,
    error: () => (state: STATE) => (any | undefined)
    message: () => (state: STATE) => (string | undefined)
}

export const createAsyncSelectors = <NAME extends string, DATA = void, STATE = Record<NAME, AsyncState<DATA>>>(taskName: NAME, moduleName?: string): ReduxAsyncSelector<NAME, DATA, STATE> => {
    const globalSelector = createGlobalSelector<STATE>(moduleName)
    return {
        ...globalSelector,
        taskState: () => (state: STATE): AsyncTaskState<DATA> => R.pathOr({} as any, buildPathWithName(taskName, moduleName), state),
        data: () => (state: STATE): (DATA | undefined) => R.path([...buildPathWithName(taskName, moduleName), 'data'], state),
        dataOr: (defaultValue: STATE) => (state: STATE): DATA => R.pathOr(defaultValue as any, [...buildPathWithName(taskName, moduleName), 'data'], state),
        loading: () => (state: STATE): boolean => R.pathOr(false, [...buildPathWithName(taskName, moduleName), 'loading'], state),
        error: () => (state: STATE): (any | undefined) => R.pathOr(false, [...buildPathWithName(taskName, moduleName), 'error'], state),
        message: () => (state: STATE): (string | undefined) => R.path([...buildPathWithName(taskName, moduleName), 'message'], state),
    }
}
