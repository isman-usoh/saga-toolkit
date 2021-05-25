import { createAction, PayloadActionCreator } from '@reduxjs/toolkit'
import * as R from 'ramda'

export const MERGE_TYPE = 'merge_value'
export const SET_VALUE_TYPE = 'set_value'
export const CLEAR_VALUE_TYPE = 'clear_value'

export interface GlobalActionType<S = any> {
    mergeValue: PayloadActionCreator<Partial<S>, string>
    setValue: PayloadActionCreator<{ path: (keyof S | string), value: any }, string>
    clearValue: PayloadActionCreator<{ path: (keyof S | string) }, string>
}

export function createGlobalAction<S = any>(moduleName: string) {
    return {
        mergeValue: createAction<Partial<S>>(`${moduleName}/${MERGE_TYPE}`),
        setValue: createAction<{ path: (keyof S | string), value: any }>(`${moduleName}/${SET_VALUE_TYPE}`),
        clearValue: createAction<{ path: (keyof S | string) }>(`${moduleName}/${CLEAR_VALUE_TYPE}`),
    }
}

export function createGlobalActionMap<S = any>(moduleName: string) {
    const actions = createGlobalAction(moduleName)
    return {
        [actions.mergeValue.type]: (state: S, action: ReturnType<GlobalActionType<S>['mergeValue']>) => {
            state = R.mergeDeepRight(state as any, action.payload)
            return state
        },
        [actions.setValue.type]: (state: S, action: ReturnType<GlobalActionType<S>['setValue']>) => {
            const paths = R.split('.', action.payload.path as any)

            let i
            for (i = 0; i < paths.length - 1; i++) {
                state = (state as any)[paths[i]]
            }
            (state as any)[paths[i]] = action.payload.value
        },
        [actions.clearValue.type]: (state: S, action: ReturnType<GlobalActionType<S>['clearValue']>) => {
            R.dissocPath(R.split('.', action.payload.path as any))(state)
        },
    }
}

interface ISelector<S = any> {
    [name: string]: (...args: any[]) => (state: S) => any
}

export interface GlobalSelector<S = any> extends ISelector<S> {
    prop: <P extends keyof S>(name: P | string) => (state: S) => S[P] | undefined
    propOr: <P extends keyof S>(name: P | string, defaultValue: S[P]) => (state: S) => S[P]
    path: <T = any>(path: string) => (state: S) => T | undefined
    pathOr: <T = any>(path: string, defaultValue: T) => (state: S) => T
}

export const buildPathWithName = (name: any, prefixPath?: string): string[] => prefixPath
    ? [prefixPath, name]
    : [name]

export const buildPathWithPath = (path: any, prefixPath?: string): string[] => prefixPath
    ? [prefixPath, ...R.split('.', path as any)]
    : R.split('.', path as any)

export function createGlobalSelector<S = any>(prefixPath?: string): GlobalSelector<S> {
    return {
        prop: (name) => (state: S) => R.path(buildPathWithName(name, prefixPath), state),
        propOr: (name, defaultValue) => (state: S) => R.pathOr(defaultValue, buildPathWithName(name, prefixPath), state),
        path: (path: string) => (state: S) => R.path(buildPathWithPath(path, prefixPath), state),
        pathOr: (path: string, defaultValue) => (state: S) => R.pathOr(defaultValue, buildPathWithPath(path, prefixPath), state),
    }
}
