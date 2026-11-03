package com.example.permitmap.common.error;

import com.example.permitmap.restaurant.exception.RestaurantNotFoundException;
import com.example.permitmap.business.exception.BusinessNotFoundException;
import com.example.permitmap.business.exception.InvalidBusinessQueryException;

import org.springframework.http.HttpStatus;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
// @RestControllerAdvice는 Controller에서 발생하거나 전달된 예외를 공통으로 처리합니다.
public class GlobalExceptionHandler {

  @ExceptionHandler(BusinessNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleBusinessNotFound(BusinessNotFoundException exception) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(new ErrorResponse("BUSINESS_NOT_FOUND", exception.getMessage()));
  }

  @ExceptionHandler(InvalidBusinessQueryException.class)
  public ResponseEntity<ErrorResponse> handleBusinessQuery(InvalidBusinessQueryException exception) {
    return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_QUERY", exception.getMessage()));
  }

  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  public ResponseEntity<ErrorResponse> handleQueryType(MethodArgumentTypeMismatchException exception) {
    return ResponseEntity.badRequest().body(new ErrorResponse("INVALID_QUERY",
        "요청 값의 형식이 올바르지 않습니다: " + exception.getName()));
  }

  @ExceptionHandler(RestaurantNotFoundException.class)
  public ResponseEntity<ErrorResponse> handleNotFound(RestaurantNotFoundException exception) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("RESTAURANT_NOT_FOUND",
        exception.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ErrorResponse> handleValidation(
      MethodArgumentNotValidException exception) {
    return ResponseEntity.badRequest().body(new ErrorResponse(
        "INVALID_INPUT",
        "이름, 주소, 카테고리는 공백일 수 없습니다."));

  }

}
