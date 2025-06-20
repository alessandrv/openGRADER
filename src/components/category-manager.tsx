import React, { useState, useEffect } from "react";
import { Button, Card, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroCategory } from "../types/macro";

// Rainbow palette with 20 colors ordered by hue - complete rainbow spectrum
const colorOptions = [
  { name: "Red", value: "red" },
  { name: "Rose", value: "rose" },
  { name: "Pink", value: "pink" },
  { name: "Fuchsia", value: "fuchsia" },
  { name: "Purple", value: "purple" },
  { name: "Violet", value: "violet" },
  { name: "Indigo", value: "indigo" },
  { name: "Blue", value: "blue" },
  { name: "Sky", value: "sky" },
  { name: "Cyan", value: "cyan" },
  { name: "Teal", value: "teal" },
  { name: "Emerald", value: "emerald" },
  { name: "Green", value: "green" },
  { name: "Lime", value: "lime" },
  { name: "Yellow", value: "yellow" },
  { name: "Amber", value: "amber" },
  { name: "Orange", value: "orange" },
  { name: "Coral", value: "coral" },
  { name: "Salmon", value: "salmon" },
  { name: "Crimson", value: "crimson" }
];

// Helper function to convert hex color to CSS custom property
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

interface CategoryManagerProps {
  onCategoriesChange: (categories: MacroCategory[]) => void;
  onClose?: () => void; // Added to support closing from parent
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ onCategoriesChange, onClose }) => {
  const [categories, setCategories] = useState<MacroCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<MacroCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedColor, setSelectedColor] = useState("blue");
  const [customColor, setCustomColor] = useState("#3b82f6"); // Default blue hex
  const [isCustomColor, setIsCustomColor] = useState(false);
  
  const { isOpen, onOpen, onClose: closeModal, onOpenChange } = useDisclosure();

  // Load categories from localStorage on mount
  useEffect(() => {
    const storedCategories = localStorage.getItem("macroCategories");
    if (storedCategories) {
      try {
        const parsedCategories = JSON.parse(storedCategories);
        setCategories(parsedCategories);
      } catch (e) {
        console.error("Failed to parse categories from localStorage", e);
      }
    } else {
      // Initialize with default categories if none exist
      const defaultCategories: MacroCategory[] = [
        { id: "default", name: "General", color: "emerald", isExpanded: true },
        { id: "davinci", name: "DaVinci Resolve", color: "blue", isExpanded: true },
        { id: "photoshop", name: "Photoshop", color: "purple", isExpanded: true }
      ];
      setCategories(defaultCategories);
      saveCategories(defaultCategories);
    }
  }, []);

  const saveCategories = (updatedCategories: MacroCategory[]) => {
    localStorage.setItem("macroCategories", JSON.stringify(updatedCategories));
    onCategoriesChange(updatedCategories);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setNewCategoryName("");
    setSelectedColor("blue");
    setCustomColor("#3b82f6");
    setIsCustomColor(false);
    onOpen();
  };

  const handleEditCategory = (category: MacroCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    
    // Check if the color is a predefined color or custom
    const isPresetColor = colorOptions.some(option => option.value === category.color);
    if (isPresetColor) {
      setSelectedColor(category.color);
      setIsCustomColor(false);
    } else {
      // It's a custom hex color
      setCustomColor(category.color);
      setIsCustomColor(true);
    }
    onOpen();
  };

  const handleDeleteCategory = (categoryId: string) => {
    const updatedCategories = categories.filter(cat => cat.id !== categoryId);
    setCategories(updatedCategories);
    saveCategories(updatedCategories);
  };

  const handleSaveCategory = () => {
    if (!newCategoryName.trim()) return;

    const finalColor = isCustomColor ? customColor : selectedColor;

    let updatedCategories: MacroCategory[];

    if (editingCategory) {
      // Update existing category
      updatedCategories = categories.map(cat => 
        cat.id === editingCategory.id 
          ? { ...cat, name: newCategoryName, color: finalColor }
          : cat
      );
    } else {
      // Create new category
      const newCategory: MacroCategory = {
        id: crypto.randomUUID(),
        name: newCategoryName,
        color: finalColor,
        isExpanded: true
      };
      updatedCategories = [...categories, newCategory];
    }

    setCategories(updatedCategories);
    saveCategories(updatedCategories);
    closeModal();
  };

  const renderCategoryColor = (color: string) => {
    // Check if it's a predefined color or custom hex
    const isPresetColor = colorOptions.some(option => option.value === color);
    
    if (isPresetColor) {
      return <div className={`category-color category-color-${color}`}></div>;
    } else {
      // Custom hex color
      return (
        <div 
          className="category-color"
          style={{ backgroundColor: color }}
        ></div>
      );
    }
  };

  return (
    <>
      <Card className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Macro Categories</h3>
          <Button 
            size="sm" 
            color="primary" 
            startContent={<Icon icon="lucide:plus" />}
            onPress={handleAddCategory}
          >
            Add Category
          </Button>
        </div>

        <div className="space-y-2">
          {categories.map(category => (
            <div key={category.id} className="flex justify-between items-center p-2 hover:bg-default-50 rounded-md">
              <div className="flex items-center gap-2">
                {renderCategoryColor(category.color)}
                <span>{category.name}</span>
                {category.id === "default" && (
                  <Chip size="sm" variant="flat">Default</Chip>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onPress={() => handleEditCategory(category)}
                  isDisabled={category.id === "default"} // Prevent editing default category
                >
                  <Icon icon="lucide:edit" className="text-default-500" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  onPress={() => handleDeleteCategory(category.id)}
                  isDisabled={category.id === "default"} // Prevent deleting default category
                >
                  <Icon icon="lucide:trash-2" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {onClose && (
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              variant="light"
              onPress={onClose}
            >
              Close
            </Button>
          </div>
        )}
      </Card>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingCategory ? "Edit Category" : "Add Category"}
              </ModalHeader>
              <ModalBody>
                <Input
                  label="Category Name"
                  placeholder="e.g., Photoshop, DaVinci Resolve"
                  value={newCategoryName}
                  onValueChange={setNewCategoryName}
                  className="mb-4"
                />
                <div>
                  <p className="text-sm font-medium mb-2">Category Color</p>
                  
                  {/* Color type selector */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      size="sm"
                      variant={!isCustomColor ? "solid" : "bordered"}
                      color={!isCustomColor ? "primary" : "default"}
                      onPress={() => setIsCustomColor(false)}
                    >
                      Preset Colors
                    </Button>
                    <Button
                      size="sm"
                      variant={isCustomColor ? "solid" : "bordered"}
                      color={isCustomColor ? "primary" : "default"}
                      onPress={() => setIsCustomColor(true)}
                    >
                      Custom Color
                    </Button>
                  </div>

                  {!isCustomColor ? (
                    // Preset colors grid
                    <div className="grid grid-cols-10 gap-2 max-h-[200px] overflow-y-auto p-2">
                      {colorOptions.map(color => (
                        <div 
                          key={color.value}
                          className={`category-color category-color-${color.value} cursor-pointer transition-transform ${
                            selectedColor === color.value ? 'ring-2 ring-offset-2 ring-primary transform scale-125' : 'hover:scale-110'
                          }`}
                          onClick={() => setSelectedColor(color.value)}
                          title={color.name}
                        />
                      ))}
                    </div>
                  ) : (
                    // Custom color picker
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          className="w-12 h-12 rounded-full border-2 border-default-200 cursor-pointer"
                        />
                        <Input
                          label="Hex Color"
                          value={customColor}
                          onValueChange={setCustomColor}
                          placeholder="#3b82f6"
                          className="flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-default-500">Preview:</span>
                        <div 
                          className="category-color"
                          style={{ backgroundColor: customColor }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSaveCategory}>
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}; 