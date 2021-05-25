import { createReducer, Reducer, AnyAction } from '@reduxjs/toolkit'
import { ForkEffect } from 'redux-saga/effects'
import * as R from 'ramda'
import * as redux from 'react-redux'

import { createGlobalAction, createGlobalActionMap, createGlobalSelector, GlobalSelector } from './global-task'
import { ReduxAsyncTask } from './redux-async-task'
import { ReduxTask } from './redux-task'

type Parameters2<T> = T extends (...args: infer P) => any ? P : never
type ReturnType2<T> = T extends (...args: any) => infer V ? V : any

export interface ReduxModule<NAME extends string, STATE, SELECTOR> {
    moduleName: NAME
    moduleStateSelector: (rootState: any) => STATE
    reducer: Reducer<STATE, AnyAction>
    reducerObj: Record<NAME, Reducer<STATE, AnyAction>>

    sagaTasks: ForkEffect[]

    fromRootSelectors: SELECTOR & GlobalSelector<any>

    useSelector: <P extends keyof STATE>(...props: readonly P[]) => Pick<STATE, Exclude<keyof STATE, Exclude<keyof STATE, P>>>
    useState: () => STATE
    useAction: () => {
        onSetValue: (path: (keyof STATE | string), value: any) => void,
        onClearValue: (path: (keyof STATE | string)) => void,
        onMergeValue: (value: Partial<STATE>) => void
    }
    useModule: () => STATE & {
        onSetValue: (path: (keyof STATE | string), value: any) => void,
        onClearValue: (path: (keyof STATE | string)) => void,
        onMergeValue: (value: Partial<STATE>) => void
    }
}

export function createReduxModule<NAME extends string, STATE = any, SELECTOR = { [name: string]: (...args: any) => (modelState: STATE) => any }>(
    options: {
        moduleName: NAME
        initialState?: Partial<STATE>
        tasks: any | ReduxAsyncTask<any, any, any, any>[] | ReduxTask[]
        extraActionMap?: { [type: string]: (state: STATE, action: any) => void }
        extraSelector?: SELECTOR
        extraSaga?: ForkEffect[]
    },
) {
    const {
        initialState = {} as any,
        moduleName,
        tasks,
        extraActionMap = {},
        extraSaga = [],
        extraSelector = {} as any,
    } = options

    const actionsMap = combindActionsMap(tasks)
    const globalActionMap = createGlobalActionMap<STATE>(moduleName)
    const globalSelector = createGlobalSelector<STATE>(moduleName)
    const globalActions = createGlobalAction<STATE>(moduleName)
    const reducer = createReducer<STATE, any>({
        ...initialState,
        ...combindInitialState(tasks),
    }, { ...actionsMap, ...globalActionMap, ...extraActionMap })

    const moduleStateSelector = (rootState: any): STATE => rootState[moduleName]
    const wrapperSelector = (selector: any) => {
        return Object.keys(selector).reduce((newSelector, name) => {
            newSelector[name] = (...args: any[]) => (rootState: any) => {
                return selector[name](...args)(rootState[moduleName])
            }
            return newSelector
        }, {} as any)
    }
    return {
        moduleName,
        reducer,
        reducerObj: { [moduleName]: reducer } as Record<NAME, Reducer<STATE, AnyAction>>,
        sagaTasks: [...bindSagaTask(tasks), ...extraSaga],
        fromRootSelectors: {
            ...globalSelector,
            ...wrapperSelector(extraSelector),
        } as SELECTOR & GlobalSelector<STATE>,
        moduleStateSelector,

        useSelector: <ST extends GlobalSelector<STATE>>(): { [P in keyof ST]: (...args: Parameters2<ST[P]>) => ReturnType2<ReturnType2<ST[P]>> } => {
            const moduleState = redux.useSelector(moduleStateSelector)
            const globelSelectorObj = Object.keys(moduleStateSelector).reduce((newSelector, selectorName) => {
                newSelector[selectorName] = (...args: any[]) => {
                    return extraSelector[selectorName](...args)(moduleState)
                }
                return newSelector
            }, {} as any)
            return Object.keys(extraSelector).reduce((newSelector, selectorName) => {
                newSelector[selectorName] = (...args: any[]) => {
                    return extraSelector[selectorName](...args)(moduleState)
                }
                return newSelector
            }, globelSelectorObj)
        },
        useState: <T extends STATE, K extends keyof T>(...names: K[]): K[] extends undefined ? T : Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
            const moduleState = redux.useSelector(moduleStateSelector)
            if (names && names.length > 0) {
                return R.pick(names, moduleState) as any
            }
            return moduleState as any
        },
        useAction: () => {
            const dispatch = redux.useDispatch()
            const handleSetValue = (path: (keyof STATE | string), value: any) => {
                dispatch(globalActions.setValue({ path, value }))
            }
            const handleClearValue = (path: (keyof STATE | string)) => {
                dispatch(globalActions.clearValue({ path }))
            }
            const handleMergeValue = (value: Partial<STATE>) => {
                dispatch(globalActions.mergeValue(value))
            }
            return {
                onSetValue: handleSetValue,
                onClearValue: handleClearValue,
                onMergeValue: handleMergeValue,
            }
        },
        useModule: () => {
            const state = redux.useSelector(moduleStateSelector)

            const dispatch = redux.useDispatch()
            const handleSetValue = (path: (keyof STATE | string), value: any) => {
                dispatch(globalActions.setValue({ path, value }))
            }
            const handleClearValue = (path: (keyof STATE | string)) => {
                dispatch(globalActions.clearValue({ path }))
            }
            const handleMergeValue = (value: Partial<STATE>) => {
                dispatch(globalActions.mergeValue(value))
            }
            return {
                ...state,
                onSetValue: handleSetValue,
                onClearValue: handleClearValue,
                onMergeValue: handleMergeValue,
            }
        },
    }
}


function bindSagaTask(...tasks: ReduxTask[]): ForkEffect[]
function bindSagaTask(...tasks: ReduxAsyncTask<any, any, any, any>[]): ForkEffect[]
function bindSagaTask(tasks: any): ForkEffect[]
function bindSagaTask(tasks: any | ReduxAsyncTask<any, any, any, any>[] | ReduxTask[]): ForkEffect[] {
    if (Array.isArray(tasks)) {
        return tasks
            .filter(task => !!task.sagaEffect)
            .map(task => {
                return task.sagaEffect
            })
    } else {
        return Object.keys(tasks)
            .filter(key => !!tasks[key].sagaEffect)
            .map(key => {
                return tasks[key].sagaEffect
            })
    }
}

function combindInitialState(...tasks: ReduxTask[]): any
function combindInitialState(...tasks: ReduxAsyncTask<any, any, any, any>[]): any
function combindInitialState(tasks: any): any
function combindInitialState(tasks: any | ReduxAsyncTask<any, any, any, any>[] | ReduxTask[]): any {
    if (Array.isArray(tasks)) {
        return tasks.reduce((obj, task) => {
            return obj = {
                ...obj,
                ...task.initialState,
            }
        }, {} as any)
    } else {
        return Object.keys(tasks)
            .filter(key => !!tasks[key].initialState)
            .reduce((obj, key) => {
                obj = {
                    ...obj,
                    ...tasks[key].initialState,
                }
                return obj
            }, {} as any)
    }
}

function combindActionsMap(...tasks: ReduxTask[]): any
function combindActionsMap(...tasks: ReduxAsyncTask<any, any, any, any>[]): any
function combindActionsMap(tasks: any): any
function combindActionsMap(tasks: any | ReduxAsyncTask<any, any, any, any>[] | ReduxTask): any {
    if (Array.isArray(tasks)) {
        return tasks.reduce((obj, task) => {
            return obj[task.name] = {
                ...task.actionMaps,
            }
        }, {} as any)
    } else {
        return Object.keys(tasks)
            .filter(key => !!tasks[key].actionMaps)
            .reduce((obj, key) => {
                obj = {
                    ...obj,
                    ...tasks[key].actionMaps,
                }
                return obj
            }, {} as any)
    }
}
