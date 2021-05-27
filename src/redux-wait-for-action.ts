import "../typings/redux-wait-for-action"

import * as createReduxWaitForMiddleware from 'redux-wait-for-action';
import { WAIT_FOR_ACTION, ERROR_ACTION, CALLBACK_ARGUMENT, CALLBACK_ERROR_ARGUMENT } from 'redux-wait-for-action';

export default createReduxWaitForMiddleware
export { WAIT_FOR_ACTION, ERROR_ACTION, CALLBACK_ARGUMENT, CALLBACK_ERROR_ARGUMENT }
