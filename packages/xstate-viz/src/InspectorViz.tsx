import * as React from 'react';
import { createMachine, State, StateNode, SCXML, Interpreter } from 'xstate';
import { useMachine } from '@xstate/react';
import { MachineViz } from './MachineViz';
import { assign, createUpdater, ImmerUpdateEvent } from '@xstate/immer';
// import { EventRecordsViz } from './EventRecordsViz';
import { StateViz } from './StateViz';
import { createContext } from 'react';

const parseState = (stateJSON: string): State<any, any> => {
  const state = State.create(JSON.parse(stateJSON));

  delete state.history;

  return state;
};

type ViewUpdateEvent = ImmerUpdateEvent<'view.update', 'graph' | 'state'>;

const viewUpdater = createUpdater<InspectorCtx, ViewUpdateEvent>(
  'view.update',
  (ctx, { input }) => {
    ctx.view = input;
  }
);

type InspectorEvent =
  | {
      type: 'service.register';
      state: string;
      machine: string;
      id: string;
      parent?: string;
    }
  | {
      type: 'service.state';
      state: string;
      id: string;
    }
  | {
      type: 'service.select';
      id: string;
    }
  | ViewUpdateEvent;

interface ServiceDataCtx {
  state: State<any, any>;
  machine: StateNode<any, any>;
  id: string;
  parent?: string;
  events: SCXML.Event<any>[];
}
interface InspectorCtx {
  services: Record<string, ServiceDataCtx>;
  service?: string;
  view: 'graph' | 'state';
}

const inspectorMachine = createMachine<InspectorCtx, InspectorEvent>({
  id: 'inspector',
  context: {
    services: {},
    service: undefined,
    view: 'graph'
  },
  initial: 'pending',
  states: {
    pending: {},
    inspecting: {
      on: {
        'service.state': {
          actions: assign((ctx, e) => {
            const serviceObject = ctx.services[e.id];
            if (!serviceObject) {
              return;
            }

            if (e.state === undefined) {
              return;
            }

            serviceObject.state = parseState(e.state);
            serviceObject.events.unshift(serviceObject.state._event);

            if (!ctx.service) {
              ctx.service = e.id;
            }
          })
        },
        'service.select': {
          actions: assign((ctx, e) => {
            ctx.service = e.id;
          })
        }
      }
    }
  },
  on: {
    'service.register': {
      actions: assign((ctx, e) => {
        ctx.services[e.id] = {
          id: e.id,
          parent: e.parent,
          machine: createMachine(JSON.parse(e.machine)),
          state: parseState(e.state),
          events: []
        };
      }),
      target: '.inspecting'
    },
    [viewUpdater.type]: { actions: viewUpdater.action }
  }
});

export const ServicesContext = createContext<
  Interpreter<InspectorCtx, any, InspectorEvent>
>(null as any);

export const ServiceDataContext = createContext<ServiceDataCtx>(null as any);

export const InspectorViz: React.FC = () => {
  const [state, send, service] = useMachine(inspectorMachine);

  React.useEffect(() => {
    const handler = (event) => {
      if ('type' in event.data) {
        send(event.data);
      }
    };

    window.addEventListener('message', handler);

    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  const currentService = state.context.service
    ? state.context.services[state.context.service]
    : undefined;

  return (
    <ServicesContext.Provider value={service}>
      <div data-xviz="inspector" data-xviz-view={state.context.view}>
        <header data-xviz="inspector-header">
          <select
            onChange={(e) => {
              send({ type: 'service.select', id: e.target.value });
            }}
            value={state.context.service}
            data-xviz="inspector-action"
          >
            {Object.keys(state.context.services).map((key) => {
              return (
                <option data-xviz="service-link" key={key} value={key}>
                  {key}
                </option>
              );
            })}
          </select>

          <button
            data-xviz="inspector-action"
            onClick={() => send(viewUpdater.update('graph'))}
          >
            Graph
          </button>
          <button
            data-xviz="inspector-action"
            onClick={() => send(viewUpdater.update('state'))}
          >
            State
          </button>
        </header>

        {Object.entries(state.context.services).map(([key, service]) => {
          return (
            <ServiceDataContext.Provider value={service} key={key}>
              <div
                data-xviz="service"
                data-xviz-view={state.context.view}
                hidden={currentService !== service || undefined}
              >
                <MachineViz machine={service.machine} state={service.state} />
                {/* <EventRecordsViz events={value.events} /> */}
                <StateViz state={service.state} />
              </div>
            </ServiceDataContext.Provider>
          );
        })}
      </div>
    </ServicesContext.Provider>
  );
};
