import React from 'react';
import DraggableList from 'react-draggable-list';
import { Icon } from "@iconify/react";
import { Card, Chip, Button, Switch } from "@heroui/react";

// Simple macro type for the demo
interface MacroItem {
  id: string;
  name: string;
  type?: string;
  actions: { type: string }[];
  isActive: boolean;
}

// Props for the draggable item component
interface MacroItemProps {
  item: MacroItem;
  itemSelected: number;
  dragHandleProps: object;
  commonProps: {
    onToggle: (id: string, isActive: boolean) => void;
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

// The template for each draggable item
class MacroItemTemplate extends React.Component<MacroItemProps> {
  getDragHeight() {
    return 90; // Height during dragging
  }

  render() {
    const { item, itemSelected, dragHandleProps, commonProps } = this.props;
    const { onToggle, onEdit, onDelete } = commonProps;
    
    // Calculate scale and shadow effects during dragging
    const scale = itemSelected * 0.05 + 1;
    const shadow = itemSelected * 5 + 1;
    const dragged = itemSelected !== 0;

    return (
      <Card 
        className={`transition-all duration-200 mb-2 ${dragged ? 'dragged' : ''}`}
        style={{
          transform: `scale(${scale})`,
          boxShadow: `rgba(0, 0, 0, 0.3) 0px ${shadow}px ${2 * shadow}px 0px`,
          opacity: dragged ? 0.9 : 1
        }}
      >
        <div className="p-4">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="drag-handle cursor-grab" {...dragHandleProps}>
                  <Icon icon="lucide:grip-vertical" className="w-4 h-4" />
                </span>
                <h3 className="text-lg font-medium">{item.name}</h3>
                <Chip size="sm" variant="flat" color="primary">
                  {item.actions.length} action{item.actions.length !== 1 ? "s" : ""}
                </Chip>
              </div>
              <p className="text-sm text-foreground-500 mt-1">
                {item.type || "Default Type"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                isSelected={item.isActive}
                onValueChange={(isSelected) => onToggle(item.id, isSelected)}
                size="sm"
              />
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="primary"
                className="opacity-80 hover:opacity-100"
                onPress={() => onEdit(item.id)}
              >
                <Icon icon="lucide:edit" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                className="opacity-80 hover:opacity-100"
                onPress={() => onDelete(item.id)}
              >
                <Icon icon="lucide:trash-2" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }
}

type MacroDraggableDemoProps = {
  initialMacros?: MacroItem[];
  onOrderChange?: (newOrder: MacroItem[]) => void;
};

type MacroDraggableDemoState = {
  macros: MacroItem[];
};

class MacroDraggableDemo extends React.Component<MacroDraggableDemoProps, MacroDraggableDemoState> {
  constructor(props: MacroDraggableDemoProps) {
    super(props);
    
    // Initialize with props or default data
    this.state = {
      macros: props.initialMacros || [
        { id: '1', name: 'Macro 1', actions: [{ type: 'keypress' }], isActive: true },
        { id: '2', name: 'Macro 2', actions: [{ type: 'mouseclick' }, { type: 'delay' }], isActive: false },
        { id: '3', name: 'Macro 3', type: 'encoder-increment', actions: [{ type: 'keypress' }], isActive: true },
        { id: '4', name: 'Macro 4', actions: [{ type: 'keypress' }], isActive: false },
      ]
    };
  }
  
  private _listContainerRef = React.createRef<HTMLDivElement>();
  
  handleToggleMacro = (id: string, isActive: boolean) => {
    this.setState(prevState => ({
      macros: prevState.macros.map(macro => 
        macro.id === id ? { ...macro, isActive } : macro
      )
    }));
  }
  
  handleEditMacro = (id: string) => {
    console.log(`Edit macro ${id}`);
    // Implement edit functionality
  }
  
  handleDeleteMacro = (id: string) => {
    this.setState(prevState => ({
      macros: prevState.macros.filter(macro => macro.id !== id)
    }));
  }
  
  handleOrderChange = (newList: MacroItem[]) => {
    this.setState({ macros: newList });
    
    // Call parent's onChange handler if provided
    if (this.props.onOrderChange) {
      this.props.onOrderChange(newList);
    }
  }
  
  render() {
    const { macros } = this.state;
    
    return (
      <div className="draggable-list-demo p-4">
        <h2 className="text-xl font-semibold mb-4">Macros</h2>
        
        <div ref={this._listContainerRef} className="draggable-list-container">
          <DraggableList
            itemKey="id"
            template={MacroItemTemplate}
            list={macros}
            onMoveEnd={this.handleOrderChange}
            container={() => document.body}
            commonProps={{
              onToggle: this.handleToggleMacro,
              onEdit: this.handleEditMacro,
              onDelete: this.handleDeleteMacro
            }}
          />
        </div>
        
        <div className="mt-4 p-3 border border-default-200 rounded-md bg-default-50">
          <h3 className="text-sm font-medium mb-2">Current Order:</h3>
          <pre className="text-xs">{JSON.stringify(macros.map(m => m.name), null, 2)}</pre>
        </div>
      </div>
    );
  }
}

export default MacroDraggableDemo; 