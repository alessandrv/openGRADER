import React, { useState, useEffect } from "react";
import { Button, Card, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroCategory } from "../types/macro";

// Updated color options with exactly 16 colors (removed info and success, added yellow and violet)
const colorOptions = [
  { name: "Primary", value: "primary" },
  { name: "Secondary", value: "secondary" },
  { name: "Warning", value: "warning" },
  { name: "Danger", value: "danger" },
  { name: "Default", value: "default" },
  { name: "Purple", value: "purple" },
  { name: "Pink", value: "pink" },
  { name: "Red", value: "red" },
  { name: "Orange", value: "orange" },
  { name: "Yellow", value: "yellow" },
  { name: "Green", value: "green" },
  { name: "Teal", value: "teal" },
  { name: "Blue", value: "blue" },
  { name: "Indigo", value: "indigo" },
  { name: "Violet", value: "violet" },
  { name: "Cyan", value: "cyan" }
];

interface CategoryManagerProps {
  onCategoriesChange: (categories: MacroCategory[]) => void;
  onClose?: () => void; // Added to support closing from parent
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ onCategoriesChange, onClose }) => {
  const [categories, setCategories] = useState<MacroCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<MacroCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedColor, setSelectedColor] = useState("primary");
  
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
        { id: "default", name: "General", color: "default", isExpanded: true },
        { id: "davinci", name: "DaVinci Resolve", color: "primary", isExpanded: true },
        { id: "photoshop", name: "Photoshop", color: "secondary", isExpanded: true }
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
    setSelectedColor("primary");
    onOpen();
  };

  const handleEditCategory = (category: MacroCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setSelectedColor(category.color);
    onOpen();
  };

  const handleDeleteCategory = (categoryId: string) => {
    const updatedCategories = categories.filter(cat => cat.id !== categoryId);
    setCategories(updatedCategories);
    saveCategories(updatedCategories);
  };

  const handleSaveCategory = () => {
    if (!newCategoryName.trim()) return;

    let updatedCategories: MacroCategory[];

    if (editingCategory) {
      // Update existing category
      updatedCategories = categories.map(cat => 
        cat.id === editingCategory.id 
          ? { ...cat, name: newCategoryName, color: selectedColor }
          : cat
      );
    } else {
      // Create new category
      const newCategory: MacroCategory = {
        id: crypto.randomUUID(),
        name: newCategoryName,
        color: selectedColor,
        isExpanded: true
      };
      updatedCategories = [...categories, newCategory];
    }

    setCategories(updatedCategories);
    saveCategories(updatedCategories);
    closeModal();
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
                <div className={`category-color category-color-${category.color}`}></div>
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
                  <div className="grid grid-cols-8 gap-3 max-h-[150px] overflow-y-auto p-2">
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