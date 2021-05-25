import { createAction, PayloadActionCreator } from '@reduxjs/toolkit'
import * as redux from 'react-redux'
import * as R from 'ramda'

import { createGlobalSelector, GlobalSelector } from './global-task'

type Parameters2<T> = T extends (...args: infer P) => any ? P : never
type ReturnType2<T> = T extends (...args: any) => infer V ? V : any

export interface ReduxTaskActionType<P = void> {
    call: PayloadActionCreator<P, string>
}

export interface ReduxTask<PAYLOAD = void, STATE = any, ACTION_MAP = { [type: string]: (state: STATE, action: any) => STATE | void }> {
    actionMaps: ACTION_MAP
    actions: ReduxTaskActionType<PAYLOAD>
    initialState: Partial<STATE>
    name: string

    fromRootSelectors: GlobalSelector<any>,

    types: {
        CALL: string
    }

    useSelector: <PROP extends keyof STATE>(...props: readonly PROP[]) => Pick<STATE, Exclude<keyof STATE, Exclude<keyof STATE, PROP>>>
    useState: () => STATE
    useAction: () => {
        onCall: (payload: PAYLOAD) => void;
    }
    useTask: () => STATE & {
        onCall: (payload: PAYLOAD) => void;
    }
}

export function createReduxTask<
    PAYLOAD = void,
    STATE = any,
    ACTION_MAP = { [type: string]: (state: STATE, action: any) => STATE | void },
    SELECTOR = { [name: string]: (...args: any) => (taskState: any) => any },
    >(
        options: {
            moduleName: string
            name: string;
            reducer?: (state: STATE, action: ReturnType<PayloadActionCreator<PAYLOAD, string>>) => void
            initialState?: Partial<STATE>
            extraActionMaps?: ACTION_MAP
            extraSelector?: SELECTOR,
        },
) {
    const {
        name,
        moduleName,
        reducer,
        initialState = {} as STATE,
        extraActionMaps = {},
        extraSelector = {} as any,
    } = options

    const types = {
        CALL: `${moduleName}/${name}`,
    }
    const actions = {
        call: createAction<PAYLOAD>(types.CALL),
    }

    const fromRootSelectors = createGlobalSelector(moduleName)
    const createActionMaps = (): any => {
        if (reducer) {
            return {
                ...extraActionMaps,
                [types.CALL]: reducer,
            }
        } else {
            return { ...extraActionMaps }
        }
    }
    const moduleStateSelector = (rootState: any): STATE => rootState[moduleName]

    return {
        /**
         * Task name
         */
        name,
        /**
         * Task Initial State
         */
        initialState,
        /**
         * Redux Action Type Constant
         */
        types,
        /**
         * Redux Action
         */
        actions,
        actionMaps: createActionMaps(),
        fromRootSelectors,
        useSelector: <ST extends GlobalSelector<STATE>>(): { [P in keyof ST]: (...args: Parameters2<ST[P]>) => ReturnType2<ReturnType2<ST[P]>> } => {
            const taskState = redux.useSelector(moduleStateSelector)
            const globalSelectorObj = Object.keys(moduleStateSelector).reduce((newSelector, selectorName) => {
                newSelector[selectorName] = (...args: any[]) => {
                    return extraSelector[selectorName](...args)(taskState)
                }
                return newSelector
            }, {} as any)
            return Object.keys(extraSelector).reduce((newSelector, selectorName) => {
                newSelector[selectorName] = (...args: any[]) => {
                    return extraSelector[selectorName](...args)(taskState)
                }
                return newSelector
            }, globalSelectorObj)
        },
        /**
         * Get some field of task state
         * @param names state field name
         */
        useState: <T extends STATE, K extends keyof T>(...names: K[]): K[] extends undefined ? T : Pick<T, Exclude<keyof T, Exclude<keyof T, K>>> => {
            const taskState = redux.useSelector(moduleStateSelector)
            if (names && names.length > 0) {
                return R.pick(names, taskState) as any
            }
            return taskState as any
        },
        /**
         * Get task action
         * @returns Redux action
         */
        useAction: () => {
            const dispatch = redux.useDispatch()
            const handleCall = (payload: PAYLOAD) => {
                dispatch(actions.call(payload))
            }
            return {
                onCall: handleCall,
            }
        },
        /**
         * Get all state and action
         * @returns state and action
         */
        useTask: () => {
            const state = redux.useSelector(moduleStateSelector)
            const dispatch = redux.useDispatch()
            const handleCall = (payload: PAYLOAD) => {
                dispatch(actions.call(payload))
            }
            return {
                ...state,
                onCall: handleCall,
            }
        },
    }
}
